import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import {
  LEADERBOARD_PAGE_SIZE,
  levelForXp,
  type Difficulty,
  type LeaderboardEntryDTO,
  type LeaderboardPageDTO,
  type StageId,
  type TeamLeaderboardPageDTO,
} from '@dbfc/shared';
import type { Db } from '../db/client';
import {
  leaderboardEntries,
  teamLeaderboardEntries,
  teamMembers,
  teams,
  users,
} from '../db/schema';

export type Period = 'daily' | 'weekly' | 'all';

/**
 * Insert or improve a player's best entry for a period. Only strictly better
 * results (higher score, or equal score in fewer ticks) replace the entry.
 */
export async function upsertBest(
  db: Db,
  entry: {
    periodKey: string;
    difficulty: Difficulty;
    userId: string;
    score: number;
    ticks: number;
    stage: StageId;
    runId: string;
  },
): Promise<void> {
  await db
    .insert(leaderboardEntries)
    .values({ ...entry, achievedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        leaderboardEntries.periodKey,
        leaderboardEntries.difficulty,
        leaderboardEntries.userId,
      ],
      set: {
        score: sql`excluded.score`,
        ticks: sql`excluded.ticks`,
        stage: sql`excluded.stage`,
        runId: sql`excluded.run_id`,
        achievedAt: sql`excluded.achieved_at`,
      },
      setWhere: sql`excluded.score > ${leaderboardEntries.score} or (excluded.score = ${leaderboardEntries.score} and excluded.ticks < ${leaderboardEntries.ticks})`,
    });
}

/** 1-based rank of a user's entry, or null if they have none. */
export async function rankOf(
  db: Db,
  periodKey: string,
  difficulty: Difficulty,
  userId: string,
): Promise<number | null> {
  const mine = await db
    .select()
    .from(leaderboardEntries)
    .where(
      and(
        eq(leaderboardEntries.periodKey, periodKey),
        eq(leaderboardEntries.difficulty, difficulty),
        eq(leaderboardEntries.userId, userId),
      ),
    )
    .limit(1);
  const e = mine[0];
  if (!e) return null;
  const [row] = await db
    .select({ better: count() })
    .from(leaderboardEntries)
    .innerJoin(users, eq(users.id, leaderboardEntries.userId))
    .where(
      and(
        eq(leaderboardEntries.periodKey, periodKey),
        eq(leaderboardEntries.difficulty, difficulty),
        eq(users.isGuest, false),
        sql`(${leaderboardEntries.score} > ${e.score}
          or (${leaderboardEntries.score} = ${e.score} and ${leaderboardEntries.ticks} < ${e.ticks})
          or (${leaderboardEntries.score} = ${e.score} and ${leaderboardEntries.ticks} = ${e.ticks} and ${leaderboardEntries.achievedAt} < ${e.achievedAt}))`,
      ),
    );
  return Number(row?.better ?? 0) + 1;
}

function toEntry(
  row: {
    userId: string;
    displayName: string;
    avatar: string;
    xp: number;
    score: number;
    ticks: number;
    stage: StageId;
    achievedAt: Date;
    teamTag: string | null;
    teamName: string | null;
  },
  rank: number,
): LeaderboardEntryDTO {
  return {
    rank,
    userId: row.userId,
    displayName: row.displayName,
    avatar: row.avatar,
    level: levelForXp(row.xp).level,
    team: row.teamTag && row.teamName ? { tag: row.teamTag, name: row.teamName } : null,
    score: row.score,
    ticks: row.ticks,
    stage: row.stage,
    achievedAt: row.achievedAt.toISOString(),
  };
}

const entryColumns = {
  userId: leaderboardEntries.userId,
  displayName: users.displayName,
  avatar: users.avatar,
  xp: users.xp,
  score: leaderboardEntries.score,
  ticks: leaderboardEntries.ticks,
  stage: leaderboardEntries.stage,
  achievedAt: leaderboardEntries.achievedAt,
  teamTag: teams.tag,
  teamName: teams.name,
};

/** Public leaderboard page. Contains display data only — never emails or account details. */
export async function leaderboardPage(
  db: Db,
  opts: {
    periodKey: string;
    period: 'weekly' | 'all';
    difficulty: Difficulty;
    page: number;
    viewerId: string | null;
  },
): Promise<LeaderboardPageDTO> {
  const where = and(
    eq(leaderboardEntries.periodKey, opts.periodKey),
    eq(leaderboardEntries.difficulty, opts.difficulty),
    eq(users.isGuest, false),
  );
  const offset = (opts.page - 1) * LEADERBOARD_PAGE_SIZE;
  const rows = await db
    .select(entryColumns)
    .from(leaderboardEntries)
    .innerJoin(users, eq(users.id, leaderboardEntries.userId))
    .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(where)
    .orderBy(
      desc(leaderboardEntries.score),
      asc(leaderboardEntries.ticks),
      asc(leaderboardEntries.achievedAt),
    )
    .limit(LEADERBOARD_PAGE_SIZE)
    .offset(offset);
  const [totalRow] = await db
    .select({ n: count() })
    .from(leaderboardEntries)
    .innerJoin(users, eq(users.id, leaderboardEntries.userId))
    .where(where);
  let you: LeaderboardEntryDTO | null = null;
  if (opts.viewerId) {
    const rank = await rankOf(db, opts.periodKey, opts.difficulty, opts.viewerId);
    if (rank !== null) {
      const mine = await db
        .select(entryColumns)
        .from(leaderboardEntries)
        .innerJoin(users, eq(users.id, leaderboardEntries.userId))
        .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
        .leftJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(and(where, eq(leaderboardEntries.userId, opts.viewerId)))
        .limit(1);
      if (mine[0]) you = toEntry(mine[0], rank);
    }
  }
  return {
    difficulty: opts.difficulty,
    period: opts.period,
    periodKey: opts.periodKey,
    page: opts.page,
    pageSize: LEADERBOARD_PAGE_SIZE,
    total: Number(totalRow?.n ?? 0),
    entries: rows.map((r, i) => toEntry(r, offset + i + 1)),
    you,
  };
}

export async function addTeamPoints(
  db: Db,
  periodKeys: string[],
  teamId: string,
  points: number,
  win: boolean,
): Promise<void> {
  for (const periodKey of periodKeys) {
    await db
      .insert(teamLeaderboardEntries)
      .values({ periodKey, teamId, points, races: 1, wins: win ? 1 : 0 })
      .onConflictDoUpdate({
        target: [teamLeaderboardEntries.periodKey, teamLeaderboardEntries.teamId],
        set: {
          points: sql`${teamLeaderboardEntries.points} + ${points}`,
          races: sql`${teamLeaderboardEntries.races} + 1`,
          wins: sql`${teamLeaderboardEntries.wins} + ${win ? 1 : 0}`,
          updatedAt: new Date(),
        },
      });
  }
}

export async function teamLeaderboardPage(
  db: Db,
  opts: { periodKey: string; period: 'weekly' | 'all'; page: number },
): Promise<TeamLeaderboardPageDTO> {
  const offset = (opts.page - 1) * LEADERBOARD_PAGE_SIZE;
  const memberCount =
    sql<number>`(select count(*) from ${teamMembers} where ${teamMembers.teamId} = ${teams.id})`.mapWith(
      Number,
    );
  const rows = await db
    .select({
      teamId: teams.id,
      name: teams.name,
      tag: teams.tag,
      memberCount,
      points: teamLeaderboardEntries.points,
      races: teamLeaderboardEntries.races,
      wins: teamLeaderboardEntries.wins,
    })
    .from(teamLeaderboardEntries)
    .innerJoin(teams, eq(teams.id, teamLeaderboardEntries.teamId))
    .where(eq(teamLeaderboardEntries.periodKey, opts.periodKey))
    .orderBy(
      desc(teamLeaderboardEntries.points),
      desc(teamLeaderboardEntries.wins),
      asc(teams.createdAt),
    )
    .limit(LEADERBOARD_PAGE_SIZE)
    .offset(offset);
  const [totalRow] = await db
    .select({ n: count() })
    .from(teamLeaderboardEntries)
    .where(eq(teamLeaderboardEntries.periodKey, opts.periodKey));
  return {
    period: opts.period,
    periodKey: opts.periodKey,
    page: opts.page,
    pageSize: LEADERBOARD_PAGE_SIZE,
    total: Number(totalRow?.n ?? 0),
    entries: rows.map((r, i) => ({ rank: offset + i + 1, ...r })),
  };
}
