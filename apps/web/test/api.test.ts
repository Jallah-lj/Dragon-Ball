import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, fieldErrors, isNetworkError } from '../src/lib/api';

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
