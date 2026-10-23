import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  computeUnlocks,
  emptyLifetimeStats,
  levelForXp,
  type LifetimeStats,
  type ProgressRecord,
  type SessionUserDTO,
  type TeamMembershipDTO,
  type Unlocks,
} from '@dbfc/shared';
import type { Db } from '../db/client';
import { progress, teamMembers, teams, userStats, users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

export function levelOf(xp: number): number {
  return levelForXp(xp).level;
}

export async function teamMembership(db: Db, userId: string): Promise<TeamMembershipDTO | null> {
  const rows = await db
    .select({ id: teams.id, name: teams.name, tag: teams.tag, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function sessionUserDTO(db: Db, user: UserRow): Promise<SessionUserDTO> {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isGuest: user.isGuest,
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    avatar: user.avatar,
    selectedSkin: user.selectedSkin,
    xp: user.xp,
    level: levelOf(user.xp),
    crystals: user.crystals,
    createdAt: user.createdAt.toISOString(),
    team: user.isGuest ? null : await teamMembership(db, user.id),
  };
}

export async function progressRecords(db: Db, userId: string): Promise<ProgressRecord[]> {
  const rows = await db.select().from(progress).where(eq(progress.userId, userId));
  return rows.map((r) => ({
    difficulty: r.difficulty,
    stage: r.stage,
    catches: r.catches,
    attempts: r.attempts,
    bestScore: r.bestScore,
    bestTicks: r.bestTicks,
  }));
}

export async function unlocksFor(db: Db, userId: string): Promise<Unlocks> {
  return computeUnlocks(await progressRecords(db, userId));
}

export function normalizeStats(raw: unknown): LifetimeStats {
  const base = emptyLifetimeStats();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<LifetimeStats>;
  return {
    ...base,
    ...r,
    catchesByDifficulty: { ...base.catchesByDifficulty, ...(r.catchesByDifficulty ?? {}) },
    catchesByStage: { ...base.catchesByStage, ...(r.catchesByStage ?? {}) },
  };
}

export async function lifetimeStats(db: Db, userId: string): Promise<LifetimeStats> {
  const rows = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
  return normalizeStats(rows[0]?.stats);
}

export async function usersByIds(db: Db, ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

/** Look up a registered (non-guest) account by username or email, case-insensitively. */
export async function findUserByLogin(db: Db, login: string): Promise<UserRow | null> {
  const value = login.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isGuest, false),
        or(sql`lower(${users.username}) = ${value}`, sql`lower(${users.email}) = ${value}`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function usernameTaken(
  db: Db,
  username: string,
  exceptUserId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  return rows.length > 0 && rows[0]!.id !== exceptUserId;
}

export async function emailTaken(db: Db, email: string, exceptUserId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return rows.length > 0 && rows[0]!.id !== exceptUserId;
}
