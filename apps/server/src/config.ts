import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default(false),
  DATABASE_URL: z.string().default('pglite://./.data/pglite'),
  AUTO_MIGRATE: bool.default(true),
  REDIS_URL: z.string().default(''),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_SECRET: z.string().default('dev-only-insecure-secret-change-me'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Forest Chase <no-reply@example.com>'),
  RACE_MIN_PLAYERS: z.coerce.number().int().min(1).max(6).default(2),
  /** Minimum wall-clock time a run must take, as a fraction of its simulated duration. */
  RUN_MIN_WALLCLOCK_RATIO: z.coerce.number().min(0).max(1).default(0.9),
  RATE_LIMIT_ENABLED: bool.default(true),
  STATIC_DIR: z.string().default(''),
  /** Cookie SameSite policy. 'none' (always Secure) is only for apps embedded in cross-site iframes. */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** CSP frame-ancestors (space separated). Use '*' only if the app must be embeddable. */
  FRAME_ANCESTORS: z.string().default("'self'"),
  MIGRATIONS_DIR: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof schema> & {
  allowedOrigins: string[];
  emailEnabled: boolean;
  secureCookies: boolean;
};

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<Config> = {},
): Config {
  const parsed = schema.parse({ ...env, ...overrides });
  const origins = new Set<string>();
  for (const o of parsed.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean))
    origins.add(o.replace(/\/$/, ''));
  origins.add(new URL(parsed.PUBLIC_URL).origin);
  if (parsed.NODE_ENV === 'production' && parsed.SESSION_SECRET.startsWith('dev-only')) {
    throw new Error('SESSION_SECRET must be set to a long random value in production.');
  }
  return {
    ...parsed,
    ...overrides,
    allowedOrigins: [...origins],
    emailEnabled: parsed.SMTP_HOST.length > 0,
    secureCookies: parsed.PUBLIC_URL.startsWith('https://'),
  } as Config;
}
