import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adoptSessionToken,
  api,
  ApiError,
  detectBlockedCookies,
  getSessionToken,
  onUnauthorized,
  fieldErrors,
  isNetworkError,
  isTokenMode,
  setSessionToken,
  setTokenMode,
} from '../src/lib/api';

const clearCsrfCookie = () => {
  document.cookie = 'dbfc_csrf=; path=/; max-age=0';
};

beforeEach(() => {
  setTokenMode(false);
  setSessionToken(null);
  clearCsrfCookie();
});

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
        { status },
      ),
    );
}

describe('api client', () => {
  it('sends the CSRF token from the cookie on state-changing requests', async () => {
    document.cookie = 'dbfc_csrf=token-123; path=/';
    const spy = mockFetch(200, { ok: true });
    await api('/api/x', { method: 'POST', body: { a: 1 } });
    const init = spy.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-123');
    expect(init.credentials).toBe('include');
  });

  it('maps API error envelopes to typed errors with field errors', async () => {
    mockFetch(409, {
      error: { code: 'CONFLICT', message: 'Taken', details: { fieldErrors: { name: ['Taken'] } } },
    });
    const err = await api('/api/teams', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('CONFLICT');
    expect(
      fieldErrors(new ApiError(400, 'VALIDATION', 'x', { fieldErrors: { tag: ['Bad tag'] } })),
    ).toEqual({ tag: 'Bad tag' });
  });

  it('treats gateway errors and network failures as offline', async () => {
    mockFetch(500, 'proxy error');
    expect(isNetworkError(await api('/api/x').catch((e: unknown) => e))).toBe(true);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(isNetworkError(await api('/api/x').catch((e: unknown) => e))).toBe(true);
    mockFetch(500, { error: { code: 'INTERNAL', message: 'boom' } });
    const real = await api('/api/x').catch((e: unknown) => e);
    expect(isNetworkError(real)).toBe(false);
  });
});

describe('cookie-less token mode', () => {
  it('detects blocked cookies when the CSRF cookie never appears', () => {
    document.cookie = 'dbfc_csrf=present; path=/';
    expect(detectBlockedCookies()).toBe(false);
    clearCsrfCookie();
    expect(detectBlockedCookies()).toBe(true);
    expect(isTokenMode()).toBe(true);
  });

  it('sends the session as an Authorization header and asks for token responses', async () => {
    setTokenMode(true);
    setSessionToken('t'.repeat(43));
    const spy = mockFetch(200, { ok: true });
    await api('/api/runs', { method: 'POST', body: {} });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${'t'.repeat(43)}`);
    expect(headers['x-auth-mode']).toBe('token');
    expect(sessionStorage.getItem('dbfc.session.v1')).toBe('t'.repeat(43));
  });

  it('switches to token mode and retries once when cookies are blocked', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'CSRF', message: 'Missing or invalid CSRF token.' } }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ user: { id: 'u1' }, csrfToken: 'c', sessionToken: 's'.repeat(43) }),
          { status: 201 },
        ),
      );
    const res = await api<{ sessionToken: string }>('/api/auth/guest', {
      method: 'POST',
      body: {},
    });
    expect(res.sessionToken).toBe('s'.repeat(43));
    expect(spy).toHaveBeenCalledTimes(2);
    expect((spy.mock.calls[1]![1]!.headers as Record<string, string>)['x-auth-mode']).toBe('token');
    expect(isTokenMode()).toBe(true);
  });

  it('does not loop when the retry fails too', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'CSRF', message: 'Missing or invalid CSRF token.' } }),
            { status: 403 },
          ),
      );
    const err = await api('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('CSRF');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('verifying that a new session sticks', () => {
  it('keeps cookie mode and discards the token when the session cookie works', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200 }),
    );
    await adoptSessionToken('k'.repeat(43));
    expect(isTokenMode()).toBe(false);
    expect(getSessionToken()).toBeNull();
    expect(sessionStorage.getItem('dbfc.session.v1')).toBeNull();
  });

  it('switches to token mode and keeps the token when the browser dropped the session cookie', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } }),
          { status: 401 },
        ),
      );
    await adoptSessionToken('k'.repeat(43));
    expect(spy.mock.calls[0]![0]).toContain('/api/auth/me');
    expect(isTokenMode()).toBe(true);
    expect(getSessionToken()).toBe('k'.repeat(43));
  });

  it('asks for the token on sign-in calls even in cookie mode', async () => {
    const spy = mockFetch(200, {
      user: { id: 'u1' },
      csrfToken: 'c',
      sessionToken: 'k'.repeat(43),
    });
    await api('/api/auth/login', { method: 'POST', body: {}, wantSessionToken: true });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['x-auth-mode']).toBe('token');
    expect(headers.authorization).toBeUndefined();
  });

  it('reports 401s on normal requests (but not on sign-in calls) so the page can re-check', async () => {
    const seen: string[] = [];
    const off = onUnauthorized(() => seen.push('401'));
    mockFetch(401, {
      error: { code: 'UNAUTHORIZED', message: 'Please sign in or play as a guest first.' },
    });
    await api('/api/collection').catch(() => undefined);
    await api('/api/auth/login', { method: 'POST', body: {} }).catch(() => undefined);
    off();
    expect(seen).toEqual(['401']);
  });
});
