import type { FastifyInstance } from 'fastify';
import {
  dailyChallenge,
  leaderboardQuerySchema,
  teamLeaderboardQuerySchema,
  weekKey,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import { leaderboardPage, teamLeaderboardPage } from '../services/leaderboards';

export function leaderboardRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/leaderboards', async (request) => {
    const q = leaderboardQuerySchema.parse(request.query);
    const viewerId = request.user && !request.user.isGuest ? request.user.id : null;
    if (q.period === 'daily') {
      const daily = dailyChallenge();
      const page = await leaderboardPage(ctx.db, {
        periodKey: `daily:${daily.dayKey}`,
        period: 'weekly',
        difficulty: daily.difficulty,
        page: q.page,
        viewerId,
      });
      return { ...page, period: 'daily' as const };
    }
    const periodKey = q.period === 'weekly' ? weekKey() : 'all';
    return leaderboardPage(ctx.db, {
      periodKey,
      period: q.period,
      difficulty: q.difficulty,
      page: q.page,
      viewerId,
    });
  });

  app.get('/api/leaderboards/teams', async (request) => {
    const q = teamLeaderboardQuerySchema.parse(request.query);
    return teamLeaderboardPage(ctx.db, {
      periodKey: q.period === 'weekly' ? weekKey() : 'all',
      period: q.period,
      page: q.page,
    });
  });
}
