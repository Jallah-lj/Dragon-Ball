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

// ---------------------------------------------------------------------------
// Cookie-less fallback. Normally the session lives in an HttpOnly cookie. Some
// browsers refuse cookies when the app runs inside another site's frame (for
// example an embedded preview). The client then switches to "token mode": the
// server returns the session token, which is kept for this tab only and sent as
// an Authorization header.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'dbfc.session.v1';
const MODE_KEY = 'dbfc.authMode.v1';

function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the session lasts until the page is reloaded.
  }
}

let sessionToken: string | null = sessionGet(TOKEN_KEY);
let tokenMode = sessionGet(MODE_KEY) === 'token' || sessionToken !== null;

/** True when the browser refused our cookies and header tokens are used instead. */
export function isTokenMode(): boolean {
  return tokenMode;
}

export function setTokenMode(on: boolean): void {
  tokenMode = on;
  sessionSet(MODE_KEY, on ? 'token' : null);
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  sessionSet(TOKEN_KEY, token);
}

/**
 * Call after a server response, which always leaves a readable `dbfc_csrf`
 * cookie behind when cookies work. If it is missing, cookies are blocked.
 */
export function detectBlockedCookies(): boolean {
  if (!tokenMode && typeof document !== 'undefined' && !readCookie('dbfc_csrf')) setTokenMode(true);
  return tokenMode;
}

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
  /** Internal: set when retrying after switching to token mode. */
  retried?: boolean;
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
  if (tokenMode) {
    headers['x-auth-mode'] = 'token';
    if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;
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
    // The double-submit check failed because the browser refuses our cookies:
    // switch to header tokens for this tab and retry once.
    if (
      res.status === 403 &&
      err?.code === 'CSRF' &&
      !tokenMode &&
      !options.retried &&
      !readCookie('dbfc_csrf')
    ) {
      setTokenMode(true);
      return api<T>(path, { ...options, retried: true });
    }
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
