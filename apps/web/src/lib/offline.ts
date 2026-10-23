/**
 * Device-local progress for offline play (server unreachable).
 *
 * Offline runs are simulated by the same shared rules but cannot be verified,
 * so they never count toward server leaderboards, teams or account rewards.
 * They do let players unlock difficulties and stages locally.
 */
import { useSyncExternalStore } from 'react';
import {
  applyRunToStats,
  computeUnlocks,
  crystalsForRun,
  emptyLifetimeStats,
  evaluateAchievements,
  levelForXp,
  xpForRun,
  type Difficulty,
  type LifetimeStats,
  type ProgressRecord,
  type RunResult,
  type StageId,
  type Unlocks,
} from '@dbfc/shared';
import { createStore, readJson, writeJson } from './store';

export interface LocalRun {
  difficulty: Difficulty;
  stage: StageId;
  outcome: RunResult['outcome'];
  score: number;
  ticks: number;
  finishedAt: string;
}

export interface LocalProfile {
  version: 1;
  xp: number;
  crystals: number;
  records: ProgressRecord[];
  stats: LifetimeStats;
  achievements: { id: string; unlockedAt: string }[];
  recent: LocalRun[];
}

export interface LocalReward {
  xpGained: number;
  crystalsGained: number;
  newAchievements: string[];
  personalBest: boolean;
  level: number;
  leveledUp: boolean;
  unlocks: Unlocks;
}

const KEY = 'dbfc.local.v1';

function empty(): LocalProfile {
  return {
    version: 1,
    xp: 0,
    crystals: 0,
    records: [],
    stats: emptyLifetimeStats(),
    achievements: [],
    recent: [],
  };
}

function load(): LocalProfile {
  const raw = readJson<LocalProfile>(KEY);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.records)) return empty();
  return { ...empty(), ...raw, stats: { ...emptyLifetimeStats(), ...raw.stats } };
}

export const localStore = createStore<LocalProfile>(load());
localStore.subscribe(() => writeJson(KEY, localStore.get()));

export function useLocalProfile(): LocalProfile {
  return useSyncExternalStore(localStore.subscribe, localStore.get, localStore.get);
}

export function localUnlocks(profile: LocalProfile = localStore.get()): Unlocks {
  return computeUnlocks(profile.records);
}

export function applyLocalRun(
  result: RunResult,
  difficulty: Difficulty,
  stage: StageId,
): LocalReward {
  const prev = localStore.get();
  const records = prev.records.map((r) => ({ ...r }));
  let record = records.find((r) => r.difficulty === difficulty && r.stage === stage);
  if (!record) {
    record = { difficulty, stage, catches: 0, attempts: 0, bestScore: 0, bestTicks: null };
    records.push(record);
  }
  const firstCatchOfDifficulty =
    result.outcome === 'caught' &&
    !prev.records.some((r) => r.difficulty === difficulty && r.catches > 0);
  const personalBest = result.score > record.bestScore;
  record.attempts++;
  record.bestScore = Math.max(record.bestScore, result.score);
  if (result.outcome === 'caught') {
    record.catches++;
    record.bestTicks =
      record.bestTicks === null ? result.ticks : Math.min(record.bestTicks, result.ticks);
  }
  const stats = applyRunToStats(prev.stats, { result, difficulty, stage });
  const unlocked = new Set(prev.achievements.map((a) => a.id));
  const newAchievements = evaluateAchievements(
    { stats, run: { result, difficulty, stage } },
    unlocked,
  );
  const xpGained = xpForRun(result, difficulty);
  const crystalsGained = crystalsForRun(result, difficulty, firstCatchOfDifficulty);
  const levelBefore = levelForXp(prev.xp).level;
  const xp = prev.xp + xpGained;
  const now = new Date().toISOString();
  const next: LocalProfile = {
    ...prev,
    xp,
    crystals: prev.crystals + crystalsGained,
    records,
    stats,
    achievements: [...prev.achievements, ...newAchievements.map((id) => ({ id, unlockedAt: now }))],
    recent: [
      {
        difficulty,
        stage,
        outcome: result.outcome,
        score: result.score,
        ticks: result.ticks,
        finishedAt: now,
      },
      ...prev.recent,
    ].slice(0, 20),
  };
  localStore.set(next);
  const level = levelForXp(xp).level;
  return {
    xpGained,
    crystalsGained,
    newAchievements,
    personalBest,
    level,
    leveledUp: level > levelBefore,
    unlocks: computeUnlocks(records),
  };
}

export function resetLocalProfile(): void {
  localStore.set(empty());
}
