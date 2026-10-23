import { describe, expect, it } from 'vitest';
import {
  applyRunToStats,
  computeUnlocks,
  crystalsForRun,
  dailySeed,
  displayNameSchema,
  emptyLifetimeStats,
  evaluateAchievements,
  inviteCodeSchema,
  levelForXp,
  normalizeText,
  registerSchema,
  teamTagSchema,
  usernameSchema,
  weekKey,
  xpForLevel,
  xpForRun,
  type RunResult,
} from '../src/index';

const baseResult = (over: Partial<RunResult> = {}): RunResult => ({
  points: 0,
  orbs: 0,
  crystals: 0,
  scales: 0,
  pickups: 0,
  cleared: 0,
  hits: 0,
  stumbles: 0,
  pitFalls: 0,
  mudHits: 0,
  jumps: 0,
  slides: 0,
  dashes: 0,
  leaps: 0,
  shieldsUsed: 0,
  shieldBlocks: 0,
  thornsBurned: 0,
  closestGap: 0,
  maxFlow: 0,
  outcome: 'caught',
  ticks: 3600,
  seconds: 60,
  score: 5000,
  distance: 700,
  heartsLeft: 3,
  breakdown: {
    distance: 700,
    actions: 0,
    catchBonus: 1000,
    timeBonus: 0,
    heartsBonus: 0,
    multiplier: 1,
  },
  ...over,
});

describe('unlocks', () => {
  it('starts with Easy, Emerald Woodland, Dash and Leap', () => {
    const u = computeUnlocks([]);
    expect(u.difficulties).toEqual(['easy']);
    expect(u.stages).toEqual(['emerald']);
    expect(u.abilities).toEqual({ dash: true, leap: true, shield: false });
  });

  it('unlocks the next difficulty, stage and the shield after catches', () => {
    const u = computeUnlocks([{ difficulty: 'easy', stage: 'emerald', catches: 1 }]);
    expect(u.difficulties).toEqual(['easy', 'medium']);
    expect(u.stages).toEqual(['emerald', 'mistpine']);
    expect(u.abilities.shield).toBe(true);
    const u2 = computeUnlocks([
      { difficulty: 'easy', stage: 'emerald', catches: 1 },
      { difficulty: 'medium', stage: 'mistpine', catches: 2 },
    ]);
    expect(u2.difficulties).toEqual(['easy', 'medium', 'hard']);
    expect(u2.stages).toEqual(['emerald', 'mistpine', 'moonlit']);
  });
});

describe('levels, XP and crystals', () => {
  it('uses an increasing level curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(xpForLevel(2)).level).toBe(2);
    expect(levelForXp(xpForLevel(5) - 1).level).toBe(4);
    expect(xpForLevel(6) - xpForLevel(5)).toBeGreaterThan(xpForLevel(3) - xpForLevel(2));
  });

  it('awards more XP for catches and crystals for first catches', () => {
    expect(xpForRun({ score: 5000, outcome: 'caught' }, 'medium')).toBeGreaterThan(
      xpForRun({ score: 5000, outcome: 'escaped' }, 'medium'),
    );
    const r = baseResult({ crystals: 7, scales: 1 });
    expect(crystalsForRun(r, 'medium', false)).toBe(7 + 25 + 20);
    expect(crystalsForRun(r, 'medium', true)).toBe(7 + 25 + 20 + 50);
    expect(crystalsForRun({ ...r, outcome: 'escaped' }, 'medium', true)).toBe(32);
  });
});

describe('achievements', () => {
  it('grants catch, flawless and speed achievements once', () => {
    const run = {
      result: baseResult({ maxFlow: 10, seconds: 70 }),
      difficulty: 'medium' as const,
      stage: 'emerald' as const,
    };
    const stats = applyRunToStats(emptyLifetimeStats(), run);
    const earned = evaluateAchievements({ stats, run }, new Set());
    expect(earned).toEqual(
      expect.arrayContaining([
        'first-catch',
        'wildwood-runner',
        'untouchable',
        'blazing-pursuit',
        'flow-state',
      ]),
    );
    expect(earned).not.toContain('dragons-trial');
    expect(evaluateAchievements({ stats, run }, new Set(earned))).toEqual([]);
  });

  it('grants race achievements from placements', () => {
    const earned = evaluateAchievements(
      { stats: emptyLifetimeStats(), race: { placement: 1, players: 3 } },
      new Set(),
    );
    expect(earned).toEqual(['team-spirit', 'race-champion']);
  });
});

describe('validation schemas', () => {
  it('validates usernames', () => {
    expect(usernameSchema.safeParse('Ember_01').success).toBe(true);
    expect(usernameSchema.safeParse('1abc').success).toBe(false);
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('has space').success).toBe(false);
  });

  it('normalizes display names and strips control characters', () => {
    expect(normalizeText('  Ash\u200b   Wing\u0007 ')).toBe('Ash Wing');
    expect(displayNameSchema.parse('  Moss   Runner ')).toBe('Moss Runner');
    expect(displayNameSchema.safeParse('<script>').success).toBe(false);
  });

  it('validates team tags and invite codes', () => {
    expect(teamTagSchema.parse('emb')).toBe('EMB');
    expect(teamTagSchema.safeParse('TOOLONG').success).toBe(false);
    expect(inviteCodeSchema.parse('abcd2345')).toBe('ABCD2345');
    expect(inviteCodeSchema.safeParse('ABCD1234').success).toBe(false); // 1 is ambiguous and excluded
  });

  it('requires strong-enough passwords on registration', () => {
    expect(registerSchema.safeParse({ username: 'ember', password: 'short' }).success).toBe(false);
    expect(
      registerSchema.safeParse({ username: 'ember', password: 'long enough pass' }).success,
    ).toBe(true);
  });
});

describe('time keys', () => {
  it('computes ISO week keys and daily seeds', () => {
    expect(weekKey(new Date('2026-10-23T12:00:00Z'))).toBe('2026-W43');
    expect(weekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    expect(dailySeed(new Date('2026-10-23T01:00:00Z'))).toBe(
      dailySeed(new Date('2026-10-23T23:00:00Z')),
    );
    expect(dailySeed(new Date('2026-10-23T01:00:00Z'))).not.toBe(
      dailySeed(new Date('2026-10-24T01:00:00Z')),
    );
  });
});
