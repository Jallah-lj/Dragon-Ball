import type { FastifyInstance } from 'fastify';
import { dailyChallenge, RACE_MAX_PLAYERS, type ConfigDTO, type HealthDTO } from '@dbfc/shared';
import type { AppContext } from '../context';

const started = Date.now();

export function healthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    const db = await ctx.database.ping().catch(() => false);
    let redis: boolean | null = null;
    if (ctx.redis) {
      try {
        redis = (await ctx.redis.ping()) === 'PONG';
      } catch {
        redis = false;
      }
    }
    const body: HealthDTO = {
      ok: db && redis !== false,
      db,
      redis,
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      features: { email: ctx.config.emailEnabled, redis: !!ctx.redis },
    };
    return reply.status(body.ok ? 200 : 503).send(body);
  });

  app.get('/api/config', async (): Promise<ConfigDTO> => ({
    emailEnabled: ctx.config.emailEnabled,
    raceMinPlayers: ctx.config.RACE_MIN_PLAYERS,
    raceMaxPlayers: RACE_MAX_PLAYERS,
  }));

  app.get('/api/daily', async () => {
    const d = dailyChallenge();
    return { dayKey: d.dayKey, difficulty: d.difficulty, stage: d.stage };
  });
}
