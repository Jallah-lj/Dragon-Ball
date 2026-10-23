import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AppContext } from '../context';
import { sessions, users } from '../db/schema';
import { randomToken, safeEqual, tokenDigest } from '../lib/crypto';
import { AppError } from '../lib/errors';

export type UserRow = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    sessionId: string | null;
  }
}

export const SESSION_COOKIE = 'dbfc_sid';
export const CSRF_COOKIE = 'dbfc_csrf';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOUCH_INTERVAL_MS = 5 * 60_000;

export function cookieOptions(
  ctx: AppContext,
  request: FastifyRequest,
  httpOnly: boolean,
  maxAgeSeconds: number,
) {
  const sameSite = ctx.config.COOKIE_SAMESITE;
  return {
    path: '/',
    httpOnly,
    sameSite,
    // Browsers only accept SameSite=None cookies when they are Secure.
    secure: ctx.config.secureCookies || request.protocol === 'https' || sameSite === 'none',
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookie(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  reply.setCookie(
    SESSION_COOKIE,
    token,
    cookieOptions(ctx, request, true, ctx.config.SESSION_TTL_DAYS * 86400),
  );
}

export function clearSessionCookie(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const { path, sameSite, secure } = cookieOptions(ctx, request, true, 0);
  reply.clearCookie(SESSION_COOKIE, { path, sameSite, secure });
}

/** Issue a fresh CSRF token (double-submit cookie) and return it. */
export function rotateCsrf(ctx: AppContext, request: FastifyRequest, reply: FastifyReply): string {
  const token = randomToken(24);
  reply.setCookie(CSRF_COOKIE, token, cookieOptions(ctx, request, false, 30 * 86400));
  return token;
}

export function currentCsrf(ctx: AppContext, request: FastifyRequest, reply: FastifyReply): string {
  return request.cookies[CSRF_COOKIE] ?? rotateCsrf(ctx, request, reply);
}

/** Origin of the request as seen by the browser (respects the Host header behind proxies). */
function requestOrigins(request: FastifyRequest): string[] {
  const hosts = [request.headers['x-forwarded-host'], request.headers.host]
    .flat()
    .filter(Boolean) as string[];
  return hosts.flatMap((h) => [`http://${h}`, `https://${h}`]);
}

export function isAllowedOrigin(ctx: AppContext, request: FastifyRequest, origin: string): boolean {
  const normalized = origin.replace(/\/$/, '');
  return (
    ctx.config.allowedOrigins.includes(normalized) || requestOrigins(request).includes(normalized)
  );
}

export function registerAuth(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;

    // CSRF defence for state-changing requests: Origin check + double-submit token.
    if (UNSAFE.has(request.method)) {
      const origin =
        request.headers.origin ??
        (request.headers.referer ? new URL(request.headers.referer).origin : undefined);
      if (origin && !isAllowedOrigin(ctx, request, origin)) {
        throw new AppError('CSRF', 'Request origin is not allowed.');
      }
      const cookieToken = request.cookies[CSRF_COOKIE];
      const headerToken = request.headers['x-csrf-token'];
      if (!cookieToken || typeof headerToken !== 'string' || !safeEqual(cookieToken, headerToken)) {
        throw new AppError('CSRF', 'Missing or invalid CSRF token. Reload the page and try again.');
      }
    }

    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const now = new Date();
    const rows = await ctx.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenDigest(ctx.config.SESSION_SECRET, token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      clearSessionCookie(ctx, request, reply);
      return;
    }
    request.user = row.user;
    request.sessionId = row.session.id;
    if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await ctx.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
      await ctx.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.user.id));
    }
  });
}

export function requireUser(request: FastifyRequest): UserRow {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Please sign in or play as a guest first.');
  return request.user;
}

export function requireAccount(request: FastifyRequest): UserRow {
  const user = requireUser(request);
  if (user.isGuest)
    throw new AppError('GUEST_NOT_ALLOWED', 'Create a free account to use this feature.');
  return user;
}
