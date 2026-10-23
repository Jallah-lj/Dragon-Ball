import type { ErrorCode } from '@dbfc/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
let memoryCsrf: string | null = null;

export function setCsrfToken(token: string | null): void {
  memoryCsrf = token;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function csrfToken(): string | null {
  return readCookie('dbfc_csrf') ?? memoryCsrf;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** JSON API call with cookie session, CSRF header and typed errors. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['x-csrf-token'] = token;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the Forest Chase server.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new ApiError(res.status, 'NETWORK', 'The Forest Chase server is unavailable.');
    }
    const err = (
      data as { error?: { code?: ErrorCode; message?: string; details?: unknown } } | undefined
    )?.error;
    // A 5xx without our JSON error envelope comes from a proxy/gateway, not the API.
    if (res.status >= 500 && !err?.code) {
      throw new ApiError(res.status, 'NETWORK', 'The Forest Chase server is unavailable.');
    }
    throw new ApiError(
      res.status,
      err?.code ?? (res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
      err?.message ?? `Request failed (${res.status}).`,
      err?.details,
    );
  }
  return data as T;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'NETWORK';
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/** Field errors from a VALIDATION error ({ fieldErrors: { name: [msg] } }). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION') return {};
  const details = err.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(details?.fieldErrors ?? {})) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}
