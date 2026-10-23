import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { SKIN_IDS } from '@dbfc/shared';
import type { AppContext } from '../context';
import { users } from '../db/schema';
import { requireUser } from '../plugins/auth';
import { collectionDTO, equipSkin, purchaseSkin } from '../services/collection';
import { limit } from './util';

const skinParam = z.object({ id: z.enum(SKIN_IDS as [string, ...string[]]) });

export function collectionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const fresh = async (id: string) =>
    (await ctx.db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;

  app.get('/api/collection', async (request) => collectionDTO(ctx.db, requireUser(request)));

  app.post(
    '/api/collection/skins/:id/purchase',
    { config: limit(20, '1 minute') },
    async (request) => {
      const user = requireUser(request);
      const { id } = skinParam.parse(request.params);
      await purchaseSkin(ctx, user, id);
      return collectionDTO(ctx.db, await fresh(user.id));
    },
  );

  app.post('/api/collection/skins/:id/equip', async (request) => {
    const user = requireUser(request);
    const { id } = skinParam.parse(request.params);
    const { avatar } = z.object({ avatar: z.boolean().optional() }).parse(request.body ?? {});
    await equipSkin(ctx, user, id, avatar ?? false);
    return collectionDTO(ctx.db, await fresh(user.id));
  });
}
