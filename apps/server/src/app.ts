import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Redis } from 'ioredis';
import type { Config } from './config';
import type { AppContext } from './context';
import { createDatabase } from './db/client';
import { createMailer } from './lib/mailer';
import { isAllowedOrigin, registerAuth } from './plugins/auth';
import { registerErrorHandling, sendError } from './plugins/errors';
import { attachRealtime, type Realtime } from './realtime/socket';
import { authRoutes } from './routes/auth';
import { collectionRoutes } from './routes/collection';
import { healthRoutes } from './routes/health';
import { leaderboardRoutes } from './routes/leaderboards';
import { profileRoutes } from './routes/profile';
import { runRoutes } from './routes/runs';
import { teamRoutes } from './routes/teams';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  realtime: Realtime;
  close(): Promise<void>;
}

/** Find the built web client to serve in production (apps/web/dist). */
export function resolveStaticDir(config: Config): string | null {
  if (config.STATIC_DIR)
    return existsSync(resolve(config.STATIC_DIR, 'index.html')) ? resolve(config.STATIC_DIR) : null;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, '../../web/dist'),
    resolve(here, '../web/dist'),
    resolve(process.cwd(), 'apps/web/dist'),
    resolve(process.cwd(), '../web/dist'),
  ]) {
    if (existsSync(resolve(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export async function buildApp(
  config: Config,
  options: { logger?: boolean } = {},
): Promise<BuiltApp> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
            ],
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 256 * 1024,
  });

  const database = await createDatabase(config.DATABASE_URL, config.MIGRATIONS_DIR);
  if (config.AUTO_MIGRATE) await database.migrate();
  const redis = config.REDIS_URL ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 }) : null;
  const mailer = await createMailer(config, app.log);

  let realtime: Realtime | null = null;
  const ctx: AppContext = {
    config,
    database,
    db: database.db,
    mailer,
    redis,
    log: app.log,
    onSessionsRevoked: (userId, ids) => {
      void realtime
        ?.revoke(userId, ids)
        .catch((err: unknown) => app.log.warn({ err }, 'socket revoke failed'));
    },
  };

  await app.register(cookie);
  const frameAncestors = config.FRAME_ANCESTORS.split(/\s+/).filter(Boolean);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:', ...config.allowedOrigins],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors,
        upgradeInsecureRequests: null,
      },
    },
    frameguard:
      frameAncestors.length === 1 && frameAncestors[0] === "'self'"
        ? { action: 'sameorigin' }
        : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token'],
  });
  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      nameSpace: 'dbfc-rl:',
      ...(redis ? { redis } : {}),
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        ...sendError(
          'RATE_LIMITED',
          `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        ),
      }),
    });
  }

  registerErrorHandling(app);
  registerAuth(app, ctx);

  healthRoutes(app, ctx);
  authRoutes(app, ctx);
  profileRoutes(app, ctx);
  runRoutes(app, ctx);
  leaderboardRoutes(app, ctx);
  teamRoutes(app, ctx);
  collectionRoutes(app, ctx);

  const staticDir = resolveStaticDir(config);
  if (staticDir) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
      index: false,
      setHeaders: (res, path) => {
        if (path.includes('/assets/'))
          res.header('cache-control', 'public, max-age=31536000, immutable');
        else res.header('cache-control', 'no-cache');
      },
    });
    // SPA fallback: unknown non-API GET routes render the client app.
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/socket.io')
      ) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply.status(404).send(sendError('NOT_FOUND', 'No such endpoint.'));
    });
    app.log.info({ staticDir }, 'serving web client');
  }

  realtime = attachRealtime(app.server, ctx, (origin, host) => {
    const normalized = origin.replace(/\/$/, '');
    if (config.allowedOrigins.includes(normalized)) return true;
    return !!host && (normalized === `http://${host}` || normalized === `https://${host}`);
  });
  void isAllowedOrigin;

  const rt = realtime;
  return {
    app,
    ctx,
    realtime: rt,
    async close() {
      await rt.close();
      await app.close();
      redis?.disconnect();
      await database.close();
    },
  };
}
