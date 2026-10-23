/**
 * Progression rules shared by the server (authoritative) and the client
 * (offline play and UI previews).
 */
import { DIFFICULTIES, DIFFICULTY_IDS, type Difficulty } from '../sim/difficulty';
import type { AbilityLoadout, RunResult } from '../sim/simulation';
import { STAGE_IDS, STAGES, type StageId } from '../sim/stages';

export interface ProgressRecord {
  difficulty: Difficulty;
  stage: StageId;
  catches: number;
  attempts: number;
  bestScore: number;
  /** Fastest catch, in ticks (null if never caught). */
  bestTicks: number | null;
}

export interface Unlocks {
  difficulties: Difficulty[];
  stages: StageId[];
  abilities: AbilityLoadout;
}

type CatchRecord = Pick<ProgressRecord, 'difficulty' | 'stage' | 'catches'>;

/**
 * - Easy and Emerald Woodland are always available.
 * - Catch the fireball on Easy to unlock Medium; on Medium to unlock Hard.
 * - Catch it in a stage to unlock the next stage.
 * - Dragon Shield unlocks after the first catch.
 */
export function computeUnlocks(progress: readonly CatchRecord[]): Unlocks {
  const caughtDifficulties = new Set<Difficulty>();
  const caughtStages = new Set<StageId>();
  for (const p of progress) {
    if (p.catches > 0) {
      caughtDifficulties.add(p.difficulty);
      caughtStages.add(p.stage);
    }
  }
  const difficulties: Difficulty[] = ['easy'];
  if (
    caughtDifficulties.has('easy') ||
    caughtDifficulties.has('medium') ||
    caughtDifficulties.has('hard')
  )
    difficulties.push('medium');
  if (caughtDifficulties.has('medium') || caughtDifficulties.has('hard')) difficulties.push('hard');

  const stages: StageId[] = [];
  for (const id of STAGE_IDS) {
    const after = STAGES[id].unlockAfter;
    if (after === null || caughtStages.has(after)) stages.push(id);
  }
  return {
    difficulties,
    stages,
    abilities: { dash: true, leap: true, shield: caughtDifficulties.size > 0 },
  };
}

export function isRunUnlocked(unlocks: Unlocks, difficulty: Difficulty, stage: StageId): boolean {
  return unlocks.difficulties.includes(difficulty) && unlocks.stages.includes(stage);
}

export const ALL_UNLOCKED: Unlocks = {
  difficulties: [...DIFFICULTY_IDS],
  stages: [...STAGE_IDS],
  abilities: { dash: true, leap: true, shield: true },
};

/** Requirement text for a locked difficulty or stage (UI helper). */
export function unlockHint(kind: 'difficulty' | 'stage', id: Difficulty | StageId): string {
  if (kind === 'difficulty') {
    if (id === 'medium') return `Catch the fireball on ${DIFFICULTIES.easy.name} to unlock.`;
    if (id === 'hard') return `Catch the fireball on ${DIFFICULTIES.medium.name} to unlock.`;
    return '';
  }
  const after = STAGES[id as StageId].unlockAfter;
  return after ? `Catch the fireball in ${STAGES[after].name} to unlock.` : '';
}

// --- Experience & levels -----------------------------------------------------

/** Cumulative XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 125 * n * (n - 1);
}

export function levelForXp(xp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 999) level++;
  const base = xpForLevel(level);
  return { level, xpIntoLevel: xp - base, xpForNext: xpForLevel(level + 1) - base };
}

export function xpForRun(
  result: Pick<RunResult, 'score' | 'outcome'>,
  difficulty: Difficulty,
): number {
  const d = DIFFICULTIES[difficulty];
  const base = Math.floor(result.score / 25) + (result.outcome === 'caught' ? 60 : 15);
  return Math.floor(base * Math.min(1.25, d.xpMultiplier / d.scoreMultiplier + 0.25));
}

/** Crystals credited to the player's balance for a verified run. */
export function crystalsForRun(
  result: Pick<RunResult, 'crystals' | 'scales' | 'outcome'>,
  difficulty: Difficulty,
  firstCatchOfDifficulty: boolean,
): number {
  let total = result.crystals + result.scales * 25;
  if (result.outcome === 'caught') {
    total += DIFFICULTIES[difficulty].catchCrystals;
    if (firstCatchOfDifficulty) total += 50;
  }
  return total;
}
