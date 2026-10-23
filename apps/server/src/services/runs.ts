/**
 * Run tickets and server-authoritative completion.
 *
 * The client never reports a score that is trusted. It receives a single-use
 * ticket (seed, difficulty, abilities) and later submits its input log. The
 * server replays that log through the shared deterministic simulation and
 * uses only the replayed result for rewards and leaderboards.
 */
import { and, desc, eq, sql, type AnyColumn } from 'drizzle-orm';
import {
  applyRunToStats,
  computeUnlocks,
  crystalsForRun,
  dailyChallenge,
  DIFFICULTIES,
  evaluateAchievements,
  isRunUnlocked,
  levelForXp,
  replayRun,
  STAGES,
  unlockHint,
  validateInputs,
  weekKey,
  xpForRun,
  type AbilityLoadout,
  type CompleteRunInput,
  type CreateRunInput,
  type Difficulty,
  type ProgressRecord,
  type RecentRunDTO,
  type RunCompletionDTO,
  type RunResult,
  type RunTicketDTO,
  type StageId,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { achievements, progress, runs, userStats, users } from '../db/schema';
import { randomSeed } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import { rankOf, upsertBest } from './leaderboards';
import { normalizeStats, progressRecords, type UserRow } from './users';

export const RUN_TTL_MS = 2 * 60 * 60_000;
/** Allowance for network latency and clock differences in the wall-clock check. */
const WALLCLOCK_SLACK_SECONDS = 3;

export type RunRow = typeof runs.$inferSelect;

export async function createRunTicket(
  ctx: AppContext,
  user: UserRow,
  input: CreateRunInput,
): Promise<RunTicketDTO> {
  const records = await progressRecords(ctx.db, user.id);
  const unlocks = computeUnlocks(records);
  let difficulty: Difficulty = input.difficulty;
  let stage: StageId = input.stage;
  let seed = randomSeed();
  let dayKeyValue: string | null = null;
  if (input.mode === 'daily') {
    const daily = dailyChallenge();
    difficulty = daily.difficulty;
    stage = daily.stage;
    seed = daily.seed;
    dayKeyValue = daily.dayKey;
  } else if (!isRunUnlocked(unlocks, difficulty, stage)) {
    const hint = !unlocks.difficulties.includes(difficulty)
      ? unlockHint('difficulty', difficulty)
      : unlockHint('stage', stage);
    throw new AppError(
      'RUN_LOCKED',
      `${DIFFICULTIES[difficulty].name} in the ${STAGES[stage].name} is locked. ${hint}`,
    );
  }
  const [row] = await ctx.db
    .insert(runs)
    .values({
      userId: user.id,
      mode: input.mode,
      difficulty,
      stage,
      seed,
      abilities: unlocks.abilities,
      ranked: !user.isGuest,
      dayKey: dayKeyValue,
      expiresAt: new Date(Date.now() + RUN_TTL_MS),
    })
    .returning();
  return {
    runId: row!.id,
    seed,
    mode: input.mode,
    difficulty,
    stage,
    abilities: unlocks.abilities,
    ranked: !user.isGuest,
    expiresAt: row!.expiresAt.toISOString(),
  };
}

/** Create the per-player run record for a live race (seed chosen by the race). */
export async function createRaceRun(
  db: Db,
  user: Pick<UserRow, 'id' | 'isGuest'>,
  race: { code: string; seed: number; difficulty: Difficulty; stage: StageId; deadline: Date },
): Promise<{ runId: string; abilities: AbilityLoadout }> {
  const unlocks = computeUnlocks(await progressRecords(db, user.id));
  const [row] = await db
    .insert(runs)
    .values({
      userId: user.id,
      mode: 'race',
      difficulty: race.difficulty,
      stage: race.stage,
      seed: race.seed,
      abilities: unlocks.abilities,
      ranked: false,
      raceCode: race.code,
      expiresAt: race.deadline,
    })
    .returning({ id: runs.id });
  return { runId: row!.id, abilities: unlocks.abilities };
}

type Decision = { kind: 'ok'; dto: RunCompletionDTO } | { kind: 'error'; error: AppError };

export interface CompleteOptions {
  /** When the player actually started (race start); defaults to ticket creation. */
  startedAt?: Date;
}

/**
 * Verify a submitted input log and apply rewards atomically. The ticket is
 * consumed even when verification fails, so a ticket can't be probed.
 */
export async function completeRun(
  ctx: AppContext,
  userId: string,
  runId: string,
  body: CompleteRunInput,
  opts: CompleteOptions = {},
): Promise<RunCompletionDTO> {
  const validation = validateInputs(body.inputs);
  const decision = await ctx.db.transaction(async (tx): Promise<Decision> => {
    const [run] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .for('update');
    if (!run) return { kind: 'error', error: notFound('Run') };
    if (run.status !== 'active') {
      return {
        kind: 'error',
        error: new AppError('RUN_ALREADY_SUBMITTED', 'This run has already been submitted.'),
      };
    }
    const now = new Date();
    const invalidate = async (reason: string, error: AppError): Promise<Decision> => {
      await tx
        .update(runs)
        .set({ status: 'invalid', invalidReason: reason, completedAt: now })
        .where(eq(runs.id, run.id));
      return { kind: 'error', error };
    };
    if (run.expiresAt.getTime() < now.getTime()) {
      return invalidate(
        'expired',
        new AppError('RUN_EXPIRED', 'This run ticket has expired. Start a new chase.'),
      );
    }
    if (!validation.ok) {
      return invalidate(
        `inputs: ${validation.reason}`,
        new AppError('RUN_INVALID', `Run rejected: ${validation.reason}.`),
      );
    }
    const result = replayRun(
      { seed: run.seed, difficulty: run.difficulty, stage: run.stage, abilities: run.abilities },
      validation.inputs,
    );
    const started = opts.startedAt ?? run.createdAt;
    const elapsed = (now.getTime() - started.getTime()) / 1000;
    if (elapsed + WALLCLOCK_SLACK_SECONDS < result.seconds * ctx.config.RUN_MIN_WALLCLOCK_RATIO) {
      return invalidate(
        'faster-than-real-time',
        new AppError('RUN_INVALID', 'Run rejected: it finished faster than real time.'),
      );
    }
    const mismatch =
      body.claimed.score !== result.score ||
      body.claimed.ticks !== result.ticks ||
      body.claimed.outcome !== result.outcome;
    await tx
      .update(runs)
      .set({
        status: 'completed',
        completedAt: now,
        outcome: result.outcome,
        score: result.score,
        ticks: result.ticks,
        distance: result.distance,
        inputCount: validation.inputs.length / 2,
        stats: {
          orbs: result.orbs,
          crystals: result.crystals,
          scales: result.scales,
          cleared: result.cleared,
          hits: result.hits,
          pitFalls: result.pitFalls,
          dashes: result.dashes,
          leaps: result.leaps,
          thornsBurned: result.thornsBurned,
          maxFlow: result.maxFlow,
        },
      })
      .where(eq(runs.id, run.id));
    const dto = await applyRewards(tx as unknown as Db, ctx, run, result, mismatch);
    return { kind: 'ok', dto };
  });
  if (decision.kind === 'error') throw decision.error;
  return decision.dto;
}

async function applyRewards(
  tx: Db,
  ctx: AppContext,
  run: RunRow,
  result: RunResult,
  mismatch: boolean,
): Promise<RunCompletionDTO> {
  const userId = run.userId;
  const before: ProgressRecord[] = await progressRecords(tx, userId);
  const caught = result.outcome === 'caught';
  const record = before.find((r) => r.difficulty === run.difficulty && r.stage === run.stage);
  const firstCatchOfDifficulty =
    caught && !before.some((r) => r.difficulty === run.difficulty && r.catches > 0);
  const personalBest = result.score > (record?.bestScore ?? 0);

  await tx
    .insert(progress)
    .values({
      userId,
      difficulty: run.difficulty,
      stage: run.stage,
      attempts: 1,
      catches: caught ? 1 : 0,
      bestScore: result.score,
      bestTicks: caught ? result.ticks : null,
    })
    .onConflictDoUpdate({
      target: [progress.userId, progress.difficulty, progress.stage],
      set: {
        attempts: (record?.attempts ?? 0) + 1,
        catches: (record?.catches ?? 0) + (caught ? 1 : 0),
        bestScore: Math.max(record?.bestScore ?? 0, result.score),
        bestTicks: caught
          ? Math.min(record?.bestTicks ?? Infinity, result.ticks)
          : (record?.bestTicks ?? null),
        updatedAt: new Date(),
      },
    });

  // Lifetime stats (row-locked read-modify-write).
  const statsRows = await tx
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .for('update');
  const stats = applyRunToStats(normalizeStats(statsRows[0]?.stats), {
    result,
    difficulty: run.difficulty,
    stage: run.stage,
  });
  await tx
    .insert(userStats)
    .values({ userId, stats: stats as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: { stats: stats as unknown as Record<string, unknown>, updatedAt: new Date() },
    });

  // Achievements
  const owned = await tx
    .select({ id: achievements.achievementId })
    .from(achievements)
    .where(eq(achievements.userId, userId));
  const earned = evaluateAchievements(
    { stats, run: { result, difficulty: run.difficulty, stage: run.stage } },
    new Set(owned.map((a) => a.id)),
  );
  if (earned.length > 0) {
    await tx
      .insert(achievements)
      .values(earned.map((achievementId) => ({ userId, achievementId })))
      .onConflictDoNothing();
  }

  // XP & crystals
  const xpGained = xpForRun(result, run.difficulty);
  const crystalsGained = crystalsForRun(result, run.difficulty, firstCatchOfDifficulty);
  const [userBefore] = await tx
    .select({ xp: users.xp })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  const xpBefore = userBefore?.xp ?? 0;
  const [updated] = await tx
    .update(users)
    .set({
      xp: xpBefore + xpGained,
      crystals: sqlAdd(users.crystals, crystalsGained),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ xp: users.xp });
  const levelBefore = levelForXp(xpBefore).level;
  const level = levelForXp(updated?.xp ?? xpBefore).level;

  // Leaderboards (verified, ranked solo/daily runs only).
  let weekly: number | null = null;
  let allTime: number | null = null;
  if (run.ranked && run.mode !== 'race') {
    const base = {
      difficulty: run.difficulty,
      userId,
      score: result.score,
      ticks: result.ticks,
      stage: run.stage,
      runId: run.id,
    };
    const week = weekKey();
    await upsertBest(tx, { ...base, periodKey: 'all' });
    await upsertBest(tx, { ...base, periodKey: week });
    if (run.mode === 'daily' && run.dayKey)
      await upsertBest(tx, { ...base, periodKey: `daily:${run.dayKey}` });
    weekly = await rankOf(tx, week, run.difficulty, userId);
    allTime = await rankOf(tx, 'all', run.difficulty, userId);
  }

  const after = await progressRecords(tx, userId);
  ctx.log.info(
    { userId, runId: run.id, score: result.score, outcome: result.outcome, mismatch },
    'run verified',
  );
  return {
    result,
    ranked: run.ranked && run.mode !== 'race',
    mismatch,
    xpGained,
    crystalsGained,
    newAchievements: earned,
    personalBest,
    rank: { weekly, allTime },
    level,
    leveledUp: level > levelBefore,
    unlocks: computeUnlocks(after),
  };
}

function sqlAdd(column: AnyColumn, amount: number) {
  return sql`${column} + ${amount}`;
}

export async function recentRuns(db: Db, userId: string, limit = 10): Promise<RecentRunDTO[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.userId, userId), eq(runs.status, 'completed')))
    .orderBy(desc(runs.completedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    difficulty: r.difficulty,
    stage: r.stage,
    outcome: r.outcome ?? 'escaped',
    score: r.score ?? 0,
    ticks: r.ticks ?? 0,
    finishedAt: (r.completedAt ?? r.createdAt).toISOString(),
  }));
}
