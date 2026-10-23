import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { SessionInfoDTO } from '@dbfc/shared';
import type { Db } from '../db/client';
import { sessions } from '../db/schema';
import { randomToken, tokenDigest } from '../lib/crypto';

export async function createSession(
  db: Db,
  secret: string,
  userId: string,
  userAgent: string | undefined,
  ttlDays: number,
): Promise<{ id: string; token: string }> {
  const token = randomToken(32);
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: tokenDigest(secret, token),
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    })
    .returning({ id: sessions.id });
  return { id: row!.id, token };
}

export async function revokeSession(db: Db, sessionId: string, userId?: string): Promise<boolean> {
  const where = userId
    ? and(eq(sessions.id, sessionId), eq(sessions.userId, userId))
    : eq(sessions.id, sessionId);
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(where, isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/** Revoke every active session of a user (optionally keeping one). Returns revoked ids. */
export async function revokeAllSessions(
  db: Db,
  userId: string,
  keepSessionId?: string,
): Promise<string[]> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        keepSessionId ? ne(sessions.id, keepSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
  return rows.map((r) => r.id);
}

export async function listSessions(
  db: Db,
  userId: string,
  currentId: string | null,
): Promise<SessionInfoDTO[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
  const now = Date.now();
  return rows
    .filter((r) => r.expiresAt.getTime() > now)
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      userAgent: r.userAgent,
    }));
}
