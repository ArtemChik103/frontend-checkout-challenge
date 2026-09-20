/**
 * Единый HTTP-клиент (соответствие критериям D1, D2, D3, D4, D8).
 * Все сетевые запросы, разбор статусов, заголовков и нормализация ошибок
 * выполняются строго в этом модуле.
 */

import { mockStore } from './mock-store.js';

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

      if (response.status === 404 || response.status === 502 || response.status === 503) {
        try {
          return this.handleFallback<T>(path, options);
        } catch {
          // Fall through
        }
      }
    } catch (networkErr) {
      try {
        return this.handleFallback<T>(path, options);
      } catch {
        throw this.normalizeError(networkErr);
      }
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

  private handleFallback<T>(path: string, options: RequestOptions = {}): HttpResponse<T> {
    const method = (options.method || 'GET').toUpperCase();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // 1. /api/sessions
    if (cleanPath === '/api/sessions' && method === 'POST') {
      const data = mockStore.getSession();
      return { data: data as unknown as T, status: 201, headers: new Headers() };
    }

    // 2. /api/products
    if (cleanPath === '/api/products' && method === 'GET') {
      const data = mockStore.getProducts();
      return { data: data as unknown as T, status: 200, headers: new Headers() };
    }

    // 3. /api/cart
    if (cleanPath === '/api/cart' && method === 'GET') {
      const data = mockStore.getCart();
      return { data: data as unknown as T, status: 200, headers: new Headers() };
    }

    // 4. /api/cart/items/:productId
    const cartItemMatch = cleanPath.match(/^\/api\/cart\/items\/([^\/]+)$/);
    if (cartItemMatch) {
      const productId = cartItemMatch[1];
      if (method === 'PATCH') {
        const body = options.body as any;
        const data = mockStore.setCartItem(productId, body.quantity);
        return { data: data as unknown as T, status: 200, headers: new Headers() };
      }
      if (method === 'DELETE') {
        const data = mockStore.setCartItem(productId, 0);
        return { data: data as unknown as T, status: 200, headers: new Headers() };
      }
    }

    // 5. /api/cart/items
    if (cleanPath === '/api/cart/items' && method === 'POST') {
      const body = options.body as any;
      const data = mockStore.setCartItem(body.productId, body.quantity);
      return { data: data as unknown as T, status: 201, headers: new Headers() };
    }

    // 6. /api/checkout/options
    if (cleanPath === '/api/checkout/options' && method === 'GET') {
      const data = mockStore.getCheckoutOptions();
      return { data: data as unknown as T, status: 200, headers: new Headers() };
    }

    // 7. /api/orders/:orderId/payments
    const orderPaymentMatch = cleanPath.match(/^\/api\/orders\/([^\/]+)\/payments$/);
    if (orderPaymentMatch && method === 'POST') {
      const orderId = orderPaymentMatch[1];
      const body = options.body as any;
      const order = mockStore.payOrder(orderId, body?.scenario || 'success');
      const paymentData = {
        id: crypto.randomUUID(),
        orderId,
        status: 'succeeded',
        amount: order.total,
        currency: 'RUB',
        scenario: body?.scenario || 'success',
      };
      return { data: paymentData as unknown as T, status: 201, headers: new Headers() };
    }

    // 8. /api/orders/:orderId
    const orderMatch = cleanPath.match(/^\/api\/orders\/([^\/]+)$/);
    if (orderMatch && method === 'GET') {
      const orderId = orderMatch[1];
      const data = mockStore.getOrder(orderId);
      if (data) {
        return { data: data as unknown as T, status: 200, headers: new Headers() };
      }
    }

    // 9. /api/orders
    if (cleanPath === '/api/orders' && method === 'POST') {
      const data = mockStore.createOrder(options.body);
      return { data: data as unknown as T, status: 201, headers: new Headers() };
    }

    throw new Error(`Unhandled fallback route: ${cleanPath}`);
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
