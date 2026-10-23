import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  guestSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  upgradeGuestSchema,
  verifyEmailSchema,
  type AuthResponseDTO,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { emailTokens, users } from '../db/schema';
import { randomCode, randomToken, tokenDigest } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { dummyHash, hashPassword, verifyPassword } from '../lib/password';
import {
  clearSessionCookie,
  currentCsrf,
  requireAccount,
  requireUser,
  rotateCsrf,
  setSessionCookie,
  type UserRow,
  wantsTokenAuth,
} from '../plugins/auth';
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeSession,
} from '../services/sessions';
import { releaseOwnership } from '../services/teams';
import { emailTaken, findUserByLogin, sessionUserDTO, usernameTaken } from '../services/users';
import { limit, userAgent } from './util';

const VERIFY_TTL_MS = 48 * 3_600_000;
const RESET_TTL_MS = 60 * 60_000;

async function startSession(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  user: UserRow,
): Promise<AuthResponseDTO> {
  // Rotate: never reuse a pre-authentication session (prevents fixation).
  if (request.sessionId) await revokeSession(ctx.db, request.sessionId);
  const { token, id } = await createSession(
    ctx.db,
    ctx.config.SESSION_SECRET,
    user.id,
    userAgent(request),
    ctx.config.SESSION_TTL_DAYS,
  );
  setSessionCookie(ctx, request, reply, token);
  request.sessionId = id;
  const csrfToken = rotateCsrf(ctx, request, reply);
  const body: AuthResponseDTO = { user: await sessionUserDTO(ctx.db, user), csrfToken };
  // Only hand the raw token to JavaScript when the browser refuses cookies.
  if (wantsTokenAuth(request)) body.sessionToken = token;
  return body;
}

async function sendEmailToken(
  ctx: AppContext,
  user: Pick<UserRow, 'id' | 'displayName'>,
  email: string,
  purpose: 'verify' | 'reset',
): Promise<void> {
  const token = randomToken(32);
  await ctx.db.insert(emailTokens).values({
    userId: user.id,
    purpose,
    email,
    tokenHash: tokenDigest(ctx.config.SESSION_SECRET, token),
    expiresAt: new Date(Date.now() + (purpose === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS)),
  });
  const base = ctx.config.PUBLIC_URL.replace(/\/$/, '');
  const link = `${base}/auth/${purpose === 'verify' ? 'verify' : 'reset'}?token=${token}`;
  const text =
    purpose === 'verify'
      ? `Hi ${user.displayName},\n\nConfirm your email for Dragon Ball: Forest Chase:\n${link}\n\nThis link expires in 48 hours.`
      : `Hi ${user.displayName},\n\nSomeone asked to reset your Forest Chase password. If it was you, choose a new one here:\n${link}\n\nThis link expires in 1 hour. If you didn't ask, you can ignore this email.`;
  await ctx.mailer.send({
    to: email,
    subject: purpose === 'verify' ? 'Confirm your email' : 'Reset your password',
    text,
  });
}

async function consumeEmailToken(
  db: Db,
  secret: string,
  token: string,
  purpose: 'verify' | 'reset',
) {
  const rows = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, tokenDigest(secret, token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export function authRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/auth/csrf', async (request, reply) => ({
    csrfToken: currentCsrf(ctx, request, reply),
  }));

  app.get('/api/auth/me', async (request, reply) => {
    const csrfToken = currentCsrf(ctx, request, reply);
    if (!request.user) throw new AppError('UNAUTHORIZED', 'Not signed in.');
    const body: AuthResponseDTO = { user: await sessionUserDTO(ctx.db, request.user), csrfToken };
    return body;
  });

  app.post('/api/auth/register', { config: limit(10, '10 minutes') }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const fieldErrors: Record<string, string[]> = {};
    if (await usernameTaken(ctx.db, input.username))
      fieldErrors.username = ['That username is taken.'];
    if (input.email && (await emailTaken(ctx.db, input.email)))
      fieldErrors.email = ['That email is already registered.'];
    if (Object.keys(fieldErrors).length)
      throw new AppError('CONFLICT', Object.values(fieldErrors)[0]![0]!, { fieldErrors });
    const passwordHash = await hashPassword(input.password);
    const [user] = await ctx.db
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName ?? input.username,
        email: input.email ?? null,
        passwordHash,
      })
      .returning();
    if (input.email) await sendEmailToken(ctx, user!, input.email, 'verify');
    reply.status(201);
    return startSession(ctx, request, reply, user!);
  });

  app.post('/api/auth/login', { config: limit(10, '1 minute') }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await findUserByLogin(ctx.db, input.username);
    const ok = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await verifyPassword(await dummyHash(), input.password), false);
    if (!user || !ok) throw new AppError('UNAUTHORIZED', 'Invalid username or password.');
    return startSession(ctx, request, reply, user);
  });

  app.post('/api/auth/guest', { config: limit(30, '1 hour') }, async (request, reply) => {
    if (request.user)
      return {
        user: await sessionUserDTO(ctx.db, request.user),
        csrfToken: currentCsrf(ctx, request, reply),
      };
    const input = guestSchema.parse(request.body ?? {});
    const [user] = await ctx.db
      .insert(users)
      .values({ displayName: input.displayName ?? `Guest ${randomCode(4)}`, isGuest: true })
      .returning();
    reply.status(201);
    return startSession(ctx, request, reply, user!);
  });

  app.post('/api/auth/upgrade', { config: limit(10, '10 minutes') }, async (request, reply) => {
    const user = requireUser(request);
    if (!user.isGuest) throw new AppError('CONFLICT', 'You already have an account.');
    const input = upgradeGuestSchema.parse(request.body);
    const fieldErrors: Record<string, string[]> = {};
    if (await usernameTaken(ctx.db, input.username, user.id))
      fieldErrors.username = ['That username is taken.'];
    if (input.email && (await emailTaken(ctx.db, input.email, user.id)))
      fieldErrors.email = ['That email is already registered.'];
    if (Object.keys(fieldErrors).length)
      throw new AppError('CONFLICT', Object.values(fieldErrors)[0]![0]!, { fieldErrors });
    const [updated] = await ctx.db
      .update(users)
      .set({
        username: input.username,
        passwordHash: await hashPassword(input.password),
        email: input.email ?? null,
        displayName:
          input.displayName ??
          (user.displayName.startsWith('Guest ') ? input.username : user.displayName),
        isGuest: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    if (input.email) await sendEmailToken(ctx, updated!, input.email, 'verify');
    return startSession(ctx, request, reply, updated!);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionId) {
      await revokeSession(ctx.db, request.sessionId);
      if (request.user) ctx.onSessionsRevoked(request.user.id, [request.sessionId]);
    }
    clearSessionCookie(ctx, request, reply);
    rotateCsrf(ctx, request, reply);
    return reply.status(204).send();
  });

  app.post('/api/auth/logout-all', async (request, reply) => {
    const user = requireUser(request);
    await revokeAllSessions(ctx.db, user.id);
    ctx.onSessionsRevoked(user.id, 'all');
    clearSessionCookie(ctx, request, reply);
    rotateCsrf(ctx, request, reply);
    return reply.status(204).send();
  });

  app.get('/api/auth/sessions', async (request) => {
    const user = requireUser(request);
    return { sessions: await listSessions(ctx.db, user.id, request.sessionId) };
  });

  app.delete('/api/auth/sessions/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const ok = await revokeSession(ctx.db, id, user.id);
    if (!ok) throw new AppError('NOT_FOUND', 'Session not found.');
    ctx.onSessionsRevoked(user.id, [id]);
    if (id === request.sessionId) clearSessionCookie(ctx, request, reply);
    return reply.status(204).send();
  });

  app.post('/api/auth/password', { config: limit(10, '10 minutes') }, async (request, reply) => {
    const user = requireAccount(request);
    const input = changePasswordSchema.parse(request.body);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError('UNAUTHORIZED', 'Your current password is incorrect.', {
        fieldErrors: { currentPassword: ['Incorrect password.'] },
      });
    }
    await ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    const revoked = await revokeAllSessions(ctx.db, user.id, request.sessionId ?? undefined);
    ctx.onSessionsRevoked(user.id, revoked);
    return reply.status(204).send();
  });

  app.post('/api/auth/forgot', { config: limit(5, '15 minutes') }, async (request) => {
    const { email } = forgotPasswordSchema.parse(request.body);
    const user = await findUserByLogin(ctx.db, email);
    // Same response whether or not the account exists (no account enumeration).
    if (user?.email && user.email.toLowerCase() === email)
      await sendEmailToken(ctx, user, user.email, 'reset');
    return { ok: true, emailEnabled: ctx.config.emailEnabled };
  });

  app.post('/api/auth/reset', { config: limit(10, '15 minutes') }, async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    const token = await consumeEmailToken(ctx.db, ctx.config.SESSION_SECRET, input.token, 'reset');
    if (!token)
      throw new AppError(
        'BAD_REQUEST',
        'This reset link is invalid or has expired. Request a new one.',
      );
    await ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
      .where(eq(users.id, token.userId));
    await revokeAllSessions(ctx.db, token.userId);
    ctx.onSessionsRevoked(token.userId, 'all');
    return reply.status(204).send();
  });

  app.post(
    '/api/auth/verify-email',
    { config: limit(20, '15 minutes') },
    async (request, reply) => {
      const input = verifyEmailSchema.parse(request.body);
      const token = await consumeEmailToken(
        ctx.db,
        ctx.config.SESSION_SECRET,
        input.token,
        'verify',
      );
      if (!token)
        throw new AppError('BAD_REQUEST', 'This verification link is invalid or has expired.');
      const rows = await ctx.db.select().from(users).where(eq(users.id, token.userId)).limit(1);
      if (!rows[0] || rows[0].email?.toLowerCase() !== token.email.toLowerCase()) {
        throw new AppError('BAD_REQUEST', 'This link was for a different email address.');
      }
      await ctx.db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, token.userId));
      return reply.status(204).send();
    },
  );

  app.post('/api/auth/resend-verification', { config: limit(3, '15 minutes') }, async (request) => {
    const user = requireAccount(request);
    if (!user.email)
      throw new AppError('BAD_REQUEST', 'Add an email address to your profile first.');
    if (user.emailVerifiedAt) return { ok: true };
    await sendEmailToken(ctx, user, user.email, 'verify');
    return { ok: true, emailEnabled: ctx.config.emailEnabled };
  });

  app.delete('/api/auth/account', { config: limit(5, '15 minutes') }, async (request, reply) => {
    const user = requireUser(request);
    const input = deleteAccountSchema.parse(request.body);
    if (user.passwordHash && !(await verifyPassword(user.passwordHash, input.password ?? ''))) {
      throw new AppError('UNAUTHORIZED', 'Password is incorrect.', {
        fieldErrors: { password: ['Incorrect password.'] },
      });
    }
    await ctx.db.transaction(async (tx) => {
      await releaseOwnership(tx as unknown as Db, user.id);
      await tx.delete(users).where(eq(users.id, user.id));
    });
    ctx.onSessionsRevoked(user.id, 'all');
    clearSessionCookie(ctx, request, reply);
    rotateCsrf(ctx, request, reply);
    request.log.info({ userId: user.id }, 'account deleted');
    return reply.status(204).send();
  });
}
