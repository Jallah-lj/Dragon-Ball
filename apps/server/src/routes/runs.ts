import type { FastifyInstance } from 'fastify';
import { completeRunSchema, createRunSchema } from '@dbfc/shared';
import type { AppContext } from '../context';
import { requireUser } from '../plugins/auth';
import { completeRun, createRunTicket, recentRuns } from '../services/runs';
import { limit, uuidParam } from './util';

export function runRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/runs', { config: limit(40, '1 minute') }, async (request, reply) => {
    const user = requireUser(request);
    const input = createRunSchema.parse(request.body);
    reply.status(201);
    return createRunTicket(ctx, user, input);
  });

  app.post(
    '/api/runs/:id/complete',
    { config: limit(40, '1 minute'), bodyLimit: 1024 * 1024 },
    async (request) => {
      const user = requireUser(request);
      const { id } = uuidParam.parse(request.params);
      const body = completeRunSchema.parse(request.body);
      return completeRun(ctx, user.id, id, body);
    },
  );

  app.get('/api/runs/recent', async (request) => {
    const user = requireUser(request);
    return { runs: await recentRuns(ctx.db, user.id, 20) };
  });
}
