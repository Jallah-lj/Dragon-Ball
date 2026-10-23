import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';

/**
 * With TEST_PG_URL (e.g. postgres://postgres:postgres@localhost:5432/postgres)
 * each test app gets its own freshly created PostgreSQL database; otherwise an
 * in-memory PGlite database is used.
 */
async function testDatabaseUrl(): Promise<{ url: string; drop: () => Promise<void> }> {
  const admin = process.env.TEST_PG_URL;
  if (!admin) return { url: 'pglite://memory', drop: async () => undefined };
  const pg = (await import('pg')).default;
  const name = `dbfc_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const c = new pg.Client({ connectionString: admin });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

export async function createTestApp(
  overrides: Partial<Record<keyof Config, unknown>> = {},
): Promise<BuiltApp> {
  const database = await testDatabaseUrl();
  const config = loadConfig(
    {
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
      PUBLIC_URL: 'http://localhost:5173',
      RUN_MIN_WALLCLOCK_RATIO: '0',
      LOG_LEVEL: 'silent',
      REDIS_URL: '',
      SMTP_HOST: '',
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    },
    {},
  );
  const built = await buildApp(config, { logger: false });
  const close = built.close;
  return {
    ...built,
    close: async () => {
      await close();
      await database.drop();
    },
  };
}

/** HTTP client with a cookie jar and automatic CSRF double-submit header. */
export class TestClient {
  readonly cookies = new Map<string, string>();
  constructor(private readonly app: FastifyInstance) {}

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    if (method !== 'GET' && !this.cookies.has('dbfc_csrf'))
      await this.request('GET', '/api/auth/csrf');
    const csrf = this.cookies.get('dbfc_csrf');
    const res = await this.app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: {
        cookie: this.cookieHeader(),
        ...(method !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}),
        ...headers,
      },
    });
    for (const c of res.cookies) {
      const expired =
        c.maxAge === 0 ||
        (c.expires instanceof Date && c.expires.getTime() < Date.now()) ||
        c.value === '';
      if (expired) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return res;
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, body?: unknown) => this.request('POST', url, body ?? {});
  put = (url: string, body?: unknown) => this.request('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.request('PATCH', url, body ?? {});
  del = (url: string, body?: unknown) => this.request('DELETE', url, body);

  async guest(): Promise<{ id: string }> {
    const res = await this.post('/api/auth/guest', {});
    if (res.statusCode >= 300) throw new Error(`guest failed ${res.statusCode} ${res.body}`);
    return res.json().user;
  }

  async register(
    username: string,
    password = 'correct horse battery',
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const res = await this.post('/api/auth/register', { username, password, ...extra });
    if (res.statusCode !== 201) throw new Error(`register failed ${res.statusCode} ${res.body}`);
    return res.json().user;
  }
}

export function json<T = Record<string, unknown>>(res: LightMyRequestResponse): T {
  return res.json() as T;
}
