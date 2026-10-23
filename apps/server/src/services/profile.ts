import { and, count, desc, eq, sql } from 'drizzle-orm';
import { levelForXp, type Difficulty, type ProfileDTO, type PublicProfileDTO } from '@dbfc/shared';
import type { Db } from '../db/client';
import { achievements, raceResults, teamMembers, teams, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { recentRuns } from './runs';
import { lifetimeStats, progressRecords, sessionUserDTO, type UserRow } from './users';
import { computeUnlocks } from '@dbfc/shared';

function bestScores(
  records: { difficulty: Difficulty; bestScore: number }[],
): Record<Difficulty, number> {
  const out: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const r of records) out[r.difficulty] = Math.max(out[r.difficulty], r.bestScore);
  return out;
}

export async function profileDTO(db: Db, user: UserRow): Promise<ProfileDTO> {
  const records = await progressRecords(db, user.id);
  const stats = await lifetimeStats(db, user.id);
  const ach = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, user.id))
    .orderBy(desc(achievements.unlockedAt));
  return {
    user: await sessionUserDTO(db, user),
    progress: { records, unlocks: computeUnlocks(records), stats },
    achievements: ach.map((a) => ({ id: a.achievementId, unlockedAt: a.unlockedAt.toISOString() })),
    recentRuns: await recentRuns(db, user.id, 10),
    bestScores: bestScores(records),
  };
}

export async function publicProfile(db: Db, userId: string): Promise<PublicProfileDTO> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound('Player');
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isGuest, false)))
    .limit(1);
  const user = rows[0];
  if (!user) throw notFound('Player');
  const records = await progressRecords(db, user.id);
  const stats = await lifetimeStats(db, user.id);
  const ach = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, user.id))
    .orderBy(desc(achievements.unlockedAt));
  const team = await db
    .select({ id: teams.id, name: teams.name, tag: teams.tag })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, user.id))
    .limit(1);
  const [wins] = await db
    .select({ n: count() })
    .from(raceResults)
    .where(
      and(
        eq(raceResults.userId, user.id),
        eq(raceResults.placement, 1),
        sql`${raceResults.players} > 1`,
      ),
    );
  const [racesRow] = await db
    .select({ n: count() })
    .from(raceResults)
    .where(eq(raceResults.userId, user.id));
  return {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    level: levelForXp(user.xp).level,
    joinedAt: user.createdAt.toISOString(),
    team: team[0] ?? null,
    achievements: ach.map((a) => ({ id: a.achievementId, unlockedAt: a.unlockedAt.toISOString() })),
    bestScores: bestScores(records),
    catches: stats.catches,
    races: Number(racesRow?.n ?? 0),
    raceWins: Number(wins?.n ?? 0),
  };
}
