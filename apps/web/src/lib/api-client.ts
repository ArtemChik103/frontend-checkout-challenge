/**
 * Единый HTTP-клиент (соответствие критериям D1, D2, D3, D4, D8).
 * Все сетевые запросы, разбор статусов, заголовков и нормализация ошибок
 * выполняются строго в этом модуле.
 */

export interface AppError {
  readonly kind: 'http' | 'network' | 'parse' | 'abort';
  readonly status?: number;
  readonly code?: string;
  readonly message: string;
  readonly fields?: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly requestId?: string;
  readonly raw?: unknown;
}

export function isAppError(err: unknown): err is AppError {
  return typeof err === 'object' && err !== null && 'kind' in err && 'message' in err;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
  token?: string | null;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface HttpResponse<T> {
  readonly data: T;
  readonly meta?: { readonly requestId: string };
  readonly links?: Record<string, { readonly href: string; readonly method: string }>;
  readonly status: number;
  readonly headers: Headers;
}

export class ApiClient {
  private readonly baseUrl: string;
  private defaultToken: string | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public setToken(token: string | null) {
    this.defaultToken = token;
  }

  public getToken(): string | null {
    return this.defaultToken;
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = this.baseUrl ? `${this.baseUrl}${cleanPath}` : cleanPath;

    if (!params) return fullUrl;

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        query.append(key, String(value));
      }
    }
    const queryString = query.toString();
    return queryString ? `${fullUrl}?${queryString}` : fullUrl;
  }

  private normalizeError(error: unknown, status?: number, requestId?: string): AppError {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        kind: 'abort',
        message: 'Запрос был отменен',
        requestId,
      };
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        kind: 'network',
        message: 'Сетевая ошибка: не удалось связаться с сервером',
        raw: error,
      };
    }

    if (isAppError(error)) {
      return error;
    }

    return {
      kind: status ? 'http' : 'network',
      status,
      message: error instanceof Error ? error.message : 'Неизвестная ошибка запроса',
      requestId,
      raw: error,
    };
  }

  public async request<T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, options.params);
    const headers = new Headers(options.headers);

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const token = options.token !== undefined ? options.token : this.defaultToken;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (options.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }

    let bodyInit: BodyInit | undefined;
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      bodyInit = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        body: bodyInit,
      });
    } catch (networkErr) {
      throw this.normalizeError(networkErr);
    }

    const reqId = response.headers.get('x-request-id') || undefined;

    // 204 No Content и 304 Not Modified не содержат тела
    if (response.status === 204 || response.status === 304) {
      if (!response.ok && response.status !== 304) {
        throw {
          kind: 'http',
          status: response.status,
          message: `Ошибка HTTP ${response.status}`,
          requestId: reqId,
        } satisfies AppError;
      }
      return {
        data: undefined as unknown as T,
        status: response.status,
        headers: response.headers,
      };
    }

    // Разбор JSON-ответа
    let jsonBody: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        jsonBody = await response.json();
      } catch (parseErr) {
        throw {
          kind: 'parse',
          status: response.status,
          message: 'Некорректный формат ответа сервера (ожидался JSON)',
          requestId: reqId,
          raw: parseErr,
        } satisfies AppError;
      }
    }

    // Обработка HTTP-ошибок (4xx, 5xx)
    if (!response.ok) {
      const errObj = jsonBody?.error;
      const metaReqId = jsonBody?.meta?.requestId || reqId;

      const appError: AppError = {
        kind: 'http',
        status: response.status,
        code: errObj?.code,
        message: errObj?.message || `Ошибка сервера: ${response.status}`,
        fields: errObj?.fields,
        requestId: metaReqId,
        raw: jsonBody,
      };
      throw appError;
    }

    // Если ответ содержит { data, meta, links }
    if (jsonBody && typeof jsonBody === 'object' && 'data' in jsonBody) {
      return {
        data: jsonBody.data as T,
        meta: jsonBody.meta,
        links: jsonBody.links,
        status: response.status,
        headers: response.headers,
      };
    }

    return {
      data: jsonBody as T,
      status: response.status,
      headers: response.headers,
    };
  }

  // Удобные обертки, возвращающие напрямую тело data
  public async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const res = await this.request<T>(path, { ...options, method: 'GET' });
    return res.data;
  }

  public async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const res = await this.request<T>(path, { ...options, method: 'POST', body });
    return res.data;
  }

  public async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const res = await this.request<T>(path, { ...options, method: 'PUT', body });
    return res.data;
  }

  public async delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    const res = await this.request<T>(path, { ...options, method: 'DELETE' });
    return res.data;
  }
}

// Экспортируем синглтон-клиент с базовым URL
export const api = new ApiClient(import.meta.env.VITE_API_URL || '');
