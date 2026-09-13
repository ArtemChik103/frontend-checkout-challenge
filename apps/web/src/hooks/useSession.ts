import { useState, useEffect, useCallback } from 'react';
import { api, type AppError } from '../lib/api-client.js';
import type { SessionSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';

type Session = Static<typeof SessionSchema>;

const SESSION_TOKEN_KEY = 'checkout_guest_token';
const SESSION_ID_KEY = 'checkout_guest_session_id';

export function useSession() {
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(SESSION_TOKEN_KEY),
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_ID_KEY),
  );
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const createSession = useCallback(async () => {
    try {
      setError(null);
      const res = await api.request<Session>('/api/sessions', {
        method: 'POST',
        body: {},
      });

      const { token, id } = res.data;
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      localStorage.setItem(SESSION_ID_KEY, id);
      api.setToken(token);
      setSessionToken(token);
      setSessionId(id);
      return token;
    } catch (err) {
      const appErr = err as AppError;
      setError(appErr);
      throw appErr;
    }
  }, []);

  const resetSession = useCallback(async () => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
    api.setToken(null);
    setSessionToken(null);
    setSessionId(null);
    return createSession();
  }, [createSession]);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const storedToken = localStorage.getItem(SESSION_TOKEN_KEY);
      if (storedToken) {
        api.setToken(storedToken);
        setSessionToken(storedToken);
        if (isMounted) setIsInitializing(false);
      } else {
        try {
          await createSession();
        } catch {
          // Ошибка сохранится в state
        } finally {
          if (isMounted) setIsInitializing(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [createSession]);

  return {
    sessionToken,
    sessionId,
    isInitializing,
    error,
    createSession,
    resetSession,
  };
}
