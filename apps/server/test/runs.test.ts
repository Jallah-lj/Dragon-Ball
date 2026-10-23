import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  Autopilot,
  ChaseSimulation,
  dailyChallenge,
  INPUT,
  playWithAutopilot,
  type RunCompletionDTO,
  type RunTicketDTO,
} from '@dbfc/shared';
import type { BuiltApp } from '../src/app';
import { leaderboardEntries, runs } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: false });
});
afterAll(async () => built.close());

function play(ticket: RunTicketDTO, mistakes = 0) {
  const sim = new ChaseSimulation({
    seed: ticket.seed,
    difficulty: ticket.difficulty,
    stage: ticket.stage,
    abilities: ticket.abilities,
  });
  const { inputs } = playWithAutopilot(sim, new Autopilot({ seed: 3, mistakeChance: mistakes }));
  return { inputs, result: sim.result() };
}

async function ticket(
  c: TestClient,
  body: object = { mode: 'solo', difficulty: 'easy', stage: 'emerald' },
) {
  const res = await c.post('/api/runs', body);
  expect(res.statusCode).toBe(201);
  return res.json() as RunTicketDTO;
}

describe('run tickets', () => {
  it('requires a session', async () => {
    const c = new TestClient(built.app);
    const res = await c.post('/api/runs', { mode: 'solo', difficulty: 'easy', stage: 'emerald' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses locked difficulties and forests', async () => {
    const c = new TestClient(built.app);
    await c.register('Newcomer');
    const res = await c.post('/api/runs', { mode: 'solo', difficulty: 'hard', stage: 'emerald' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('RUN_LOCKED');
    expect(
      (await c.post('/api/runs', { mode: 'solo', difficulty: 'easy', stage: 'moonlit' })).json()
        .error.code,
    ).toBe('RUN_LOCKED');
  });
});

describe('server-authoritative completion', () => {
  it('replays the inputs, rewards the player, unlocks progress and ranks the score', async () => {
    const c = new TestClient(built.app);
    const user = await c.register('Chaser');
    const t = await ticket(c);
    expect(t.abilities.shield).toBe(false);
    const { inputs, result } = play(t);
    expect(result.outcome).toBe('caught');
    const res = await c.post(`/api/runs/${t.runId}/complete`, {
      inputs,
      claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
    });
    expect(res.statusCode).toBe(200);
    const done = res.json() as RunCompletionDTO;
    expect(done.result).toEqual(result);
    expect(done.mismatch).toBe(false);
    expect(done.ranked).toBe(true);
    expect(done.xpGained).toBeGreaterThan(0);
    expect(done.crystalsGained).toBeGreaterThanOrEqual(10 + 50); // catch + first catch bonus
    expect(done.newAchievements).toContain('first-catch');
    expect(done.unlocks.difficulties).toEqual(['easy', 'medium']);
    expect(done.unlocks.abilities.shield).toBe(true);
    expect(done.rank.allTime).toBe(1);

    const me = (await c.get('/api/auth/me')).json().user;
    expect(me.xp).toBe(done.xpGained);
    expect(me.crystals).toBe(done.crystalsGained);
    const entries = await built.ctx.db
      .select()
      .from(leaderboardEntries)
      .where(eq(leaderboardEntries.userId, user.id));
    expect(entries.map((e) => e.periodKey).sort()).toEqual(expect.arrayContaining(['all']));
    expect(entries).toHaveLength(2);

    // The next ticket includes the unlocked shield and Medium is now allowed.
    const t2 = await ticket(c, { mode: 'solo', difficulty: 'medium', stage: 'emerald' });
    expect(t2.abilities.shield).toBe(true);
  });

  it('tickets are single-use', async () => {
    const c = new TestClient(built.app);
    await c.register('Reuser');
    const t = await ticket(c);
    const { inputs, result } = play(t);
    const body = {
      inputs,
      claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
    };
    expect((await c.post(`/api/runs/${t.runId}/complete`, body)).statusCode).toBe(200);
    const again = await c.post(`/api/runs/${t.runId}/complete`, body);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('RUN_ALREADY_SUBMITTED');
  });

  it('never trusts the claimed score', async () => {
    const c = new TestClient(built.app);
    await c.register('Boaster');
    const t = await ticket(c);
    const { inputs, result } = play(t);
    const res = await c.post(`/api/runs/${t.runId}/complete`, {
      inputs,
      claimed: { score: 9_999_999, ticks: 10, outcome: 'caught' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mismatch).toBe(true);
    expect(res.json().result.score).toBe(result.score);
  });

  it('a forged input log only earns what it actually achieves', async () => {
    const c = new TestClient(built.app);
    await c.register('Forger');
    const t = await ticket(c);
    // Jumping every 30 ticks blindly: the server's replay decides the outcome.
    const inputs: number[] = [];
    for (let tick = 0; tick < 60 * 200; tick += 30)
      inputs.push(tick, INPUT.JumpDown, tick + 12, INPUT.JumpUp);
    const res = await c.post(`/api/runs/${t.runId}/complete`, {
      inputs,
      claimed: { score: 100000, ticks: 3000, outcome: 'caught' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.outcome).not.toBe('caught');
    expect(res.json().result.score).toBeLessThan(100000);
  });

  it('rejects malformed input logs and consumes the ticket', async () => {
    const c = new TestClient(built.app);
    await c.register('Glitcher');
    const t = await ticket(c);
    const res = await c.post(`/api/runs/${t.runId}/complete`, {
      inputs: [50, 1, 10, 2],
      claimed: { score: 1, ticks: 1, outcome: 'escaped' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('RUN_INVALID');
    const [row] = await built.ctx.db.select().from(runs).where(eq(runs.id, t.runId));
    expect(row?.status).toBe('invalid');
    expect(
      (
        await c.post(`/api/runs/${t.runId}/complete`, {
          inputs: [],
          claimed: { score: 1, ticks: 1, outcome: 'escaped' },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('rejects expired tickets and other players\u2019 runs', async () => {
    const c = new TestClient(built.app);
    await c.register('Slowpoke');
    const t = await ticket(c);
    const other = new TestClient(built.app);
    await other.register('Snoop');
    const body = { inputs: [], claimed: { score: 0, ticks: 0, outcome: 'escaped' } };
    expect((await other.post(`/api/runs/${t.runId}/complete`, body)).statusCode).toBe(404);
    await built.ctx.db
      .update(runs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(runs.id, t.runId));
    const res = await c.post(`/api/runs/${t.runId}/complete`, body);
    expect(res.statusCode).toBe(410);
    expect(res.json().error.code).toBe('RUN_EXPIRED');
  });

  it('guest runs are verified but never ranked', async () => {
    const c = new TestClient(built.app);
    const guest = await c.guest();
    const t = await ticket(c);
    expect(t.ranked).toBe(false);
    const { inputs, result } = play(t);
    const res = await c.post(`/api/runs/${t.runId}/complete`, {
      inputs,
      claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
    });
    expect(res.json().ranked).toBe(false);
    expect(
      await built.ctx.db
        .select()
        .from(leaderboardEntries)
        .where(eq(leaderboardEntries.userId, guest.id)),
    ).toHaveLength(0);
  });

  it("uses today's shared seed for the daily trail and ranks it on the daily board", async () => {
    const c = new TestClient(built.app);
    await c.register('DailyRunner');
    const t = await ticket(c, { mode: 'daily', difficulty: 'easy', stage: 'emerald' });
    const daily = dailyChallenge();
    expect(t).toMatchObject({
      seed: daily.seed,
      difficulty: daily.difficulty,
      stage: daily.stage,
      mode: 'daily',
    });
    const { inputs, result } = play(t);
    await c.post(`/api/runs/${t.runId}/complete`, {
      inputs,
      claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
    });
    const board = (await c.get('/api/leaderboards?period=daily')).json();
    expect(board.period).toBe('daily');
    expect(
      board.entries.some((e: { displayName: string }) => e.displayName === 'DailyRunner'),
    ).toBe(true);
  });
});

describe('wall-clock plausibility', () => {
  it('rejects runs that finish faster than real time', async () => {
    const strict = await createTestApp({ RATE_LIMIT_ENABLED: false, RUN_MIN_WALLCLOCK_RATIO: 0.9 });
    try {
      const c = new TestClient(strict.app);
      await c.register('Speedhack');
      const res = await c.post('/api/runs', { mode: 'solo', difficulty: 'easy', stage: 'emerald' });
      const t = res.json() as RunTicketDTO;
      const { inputs, result } = play(t);
      const done = await c.post(`/api/runs/${t.runId}/complete`, {
        inputs,
        claimed: { score: result.score, ticks: result.ticks, outcome: result.outcome },
      });
      expect(done.statusCode).toBe(422);
      expect(done.json().error.message).toMatch(/faster than real time/);
    } finally {
      await strict.close();
    }
  });
});
