import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../src/app';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: true });
});
afterAll(async () => built.close());

describe('rate limiting', () => {
  it('throttles repeated login attempts with a typed error', async () => {
    const c = new TestClient(built.app);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      codes.push(
        (await c.post('/api/auth/login', { username: 'ghost', password: 'nope nope nope' }))
          .statusCode,
      );
    }
    expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true);
    const limited = await c.post('/api/auth/login', {
      username: 'ghost',
      password: 'nope nope nope',
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });

  it('keeps the health check unthrottled', async () => {
    const c = new TestClient(built.app);
    for (let i = 0; i < 5; i++) expect((await c.get('/api/health')).statusCode).toBe(200);
    expect((await c.get('/api/health')).json()).toMatchObject({ ok: true, db: true, redis: null });
  });
});
