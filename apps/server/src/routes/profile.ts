import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { computeUnlocks, updateProfileSchema, type ProgressDTO } from '@dbfc/shared';
import type { AppContext } from '../context';
import { emailTokens, users, userSettings } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { requireUser } from '../plugins/auth';
import { ownedSkins } from '../services/collection';
import { profileDTO, publicProfile } from '../services/profile';
import { emailTaken, lifetimeStats, progressRecords, sessionUserDTO } from '../services/users';

export function profileRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/profile', async (request) => profileDTO(ctx.db, requireUser(request)));

  app.patch('/api/profile', async (request) => {
    const user = requireUser(request);
    const input = updateProfileSchema.parse(request.body);
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.displayName) patch.displayName = input.displayName;
    if (input.avatar) {
      if (!(await ownedSkins(ctx.db, user.id)).has(input.avatar))
        throw new AppError('FORBIDDEN', 'You can only use a dragon you own as your avatar.');
      patch.avatar = input.avatar;
    }
    let verifyEmail: string | null = null;
    if (input.email !== undefined && input.email !== user.email?.toLowerCase()) {
      if (user.isGuest)
        throw new AppError('GUEST_NOT_ALLOWED', 'Create an account before adding an email.');
      if (await emailTaken(ctx.db, input.email, user.id)) {
        throw new AppError('CONFLICT', 'That email is already registered.', {
          fieldErrors: { email: ['That email is already registered.'] },
        });
      }
      patch.email = input.email;
      patch.emailVerifiedAt = null;
      verifyEmail = input.email;
    }
    const [updated] = await ctx.db
      .update(users)
      .set(patch)
      .where(eq(users.id, user.id))
      .returning();
    if (verifyEmail) {
      const token = randomToken(32);
      await ctx.db.insert(emailTokens).values({
        userId: user.id,
        purpose: 'verify',
        email: verifyEmail,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 48 * 3_600_000),
      });
      await ctx.mailer.send({
        to: verifyEmail,
        subject: 'Confirm your email',
        text: `Confirm your new email for Dragon Ball: Forest Chase:\n${ctx.config.PUBLIC_URL.replace(/\/$/, '')}/auth/verify?token=${token}`,
      });
    }
    return { user: await sessionUserDTO(ctx.db, updated!) };
  });

  app.get('/api/progress', async (request): Promise<ProgressDTO> => {
    const user = requireUser(request);
    const records = await progressRecords(ctx.db, user.id);
    return {
      records,
      unlocks: computeUnlocks(records),
      stats: await lifetimeStats(ctx.db, user.id),
    };
  });

  app.get('/api/users/:id', async (request) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(request.params);
    return publicProfile(ctx.db, id);
  });

  app.get('/api/settings', async (request) => {
    const user = requireUser(request);
    const rows = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1);
    return { settings: rows[0]?.settings ?? null };
  });

  app.put('/api/settings', { bodyLimit: 16 * 1024 }, async (request) => {
    const user = requireUser(request);
    const { settings } = z
      .object({ settings: z.record(z.string(), z.unknown()) })
      .parse(request.body);
    if (JSON.stringify(settings).length > 8 * 1024)
      throw new AppError('BAD_REQUEST', 'Settings are too large.');
    await ctx.db
      .insert(userSettings)
      .values({ userId: user.id, settings })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { settings, updatedAt: new Date() },
      });
    return { ok: true };
  });
}
