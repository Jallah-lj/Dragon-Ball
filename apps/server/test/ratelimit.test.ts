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

describe('serving the web client', () => {
  it('serves index.html for client routes and JSON 404s for unknown API routes', async () => {
    const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'dbfc-static-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Forest Chase</title>');
    await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const spa = await createTestApp({ RATE_LIMIT_ENABLED: false, STATIC_DIR: dir });
    try {
      const page = await spa.app.inject({ method: 'GET', url: '/team' });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('Forest Chase');
      const asset = await spa.app.inject({ method: 'GET', url: '/assets/app.js' });
      expect(asset.headers['cache-control']).toContain('immutable');
      const api = await spa.app.inject({ method: 'GET', url: '/api/missing' });
      expect(api.statusCode).toBe(404);
      expect(api.json().error.code).toBe('NOT_FOUND');
    } finally {
      await spa.close();
    }
  });
});
