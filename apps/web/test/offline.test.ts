import { describe, expect, it } from 'vitest';
import { Autopilot, ChaseSimulation, playWithAutopilot } from '@dbfc/shared';
import { applyLocalRun, localStore, localUnlocks, resetLocalProfile } from '../src/lib/offline';

describe('offline progress', () => {
  it('applies the shared rules to unverified local runs', () => {
    resetLocalProfile();
    expect(localUnlocks().difficulties).toEqual(['easy']);
    const sim = new ChaseSimulation({
      seed: 7,
      difficulty: 'easy',
      stage: 'emerald',
      abilities: { dash: true, leap: true, shield: false },
    });
    playWithAutopilot(sim, new Autopilot({ seed: 7 }));
    const result = sim.result();
    expect(result.outcome).toBe('caught');
    const reward = applyLocalRun(result, 'easy', 'emerald');
    expect(reward.personalBest).toBe(true);
    expect(reward.newAchievements).toContain('first-catch');
    expect(reward.unlocks.difficulties).toEqual(['easy', 'medium']);
    expect(reward.unlocks.abilities.shield).toBe(true);
    const profile = localStore.get();
    expect(profile.xp).toBe(reward.xpGained);
    expect(profile.records[0]).toMatchObject({ catches: 1, attempts: 1, bestScore: result.score });
    expect(JSON.parse(localStorage.getItem('dbfc.local.v1')!).xp).toBe(reward.xpGained);
    const again = applyLocalRun(result, 'easy', 'emerald');
    expect(again.personalBest).toBe(false);
    expect(again.newAchievements).not.toContain('first-catch');
  });
});
