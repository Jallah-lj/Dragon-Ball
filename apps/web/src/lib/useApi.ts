import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload(): void;
  setData(updater: T | null | ((prev: T | null) => T | null)): void;
}

interface Settled<T> {
  key: string;
  data: T | null;
  error: unknown;
}

/**
 * Fetch JSON from `path` (null = skip) and re-fetch when it changes. `loading`
 * is derived: true until the response for the current request has settled.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [nonce, setNonce] = useState(0);
  const key = path === null ? null : `${path}#${nonce}`;
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (path === null || key === null) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(
      (data) => setSettled({ key, data, error: null }),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSettled((prev) => ({ key, data: prev?.data ?? null, error }));
      },
    );
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (updater: T | null | ((prev: T | null) => T | null)) =>
      setSettled((prev) => {
        const current = prev?.data ?? null;
        const data =
          typeof updater === 'function' ? (updater as (p: T | null) => T | null)(current) : updater;
        return { key: prev?.key ?? key ?? '', data, error: null };
      }),
    [key],
  );

  const isCurrent = settled !== null && settled.key === key;
  return {
    data: settled?.data ?? null,
    error: isCurrent ? settled.error : null,
    loading: key !== null && !isCurrent,
    reload,
    setData,
  };
}
