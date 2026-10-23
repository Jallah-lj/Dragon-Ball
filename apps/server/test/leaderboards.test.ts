import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { weekKey } from '@dbfc/shared';
import type { BuiltApp } from '../src/app';
import { leaderboardEntries, users } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: false });
});
afterAll(async () => built.close());

describe('leaderboards', () => {
  it('ranks by score then time, paginates, and exposes no private data', async () => {
    const viewer = new TestClient(built.app);
    const viewerUser = await viewer.register('Viewer', 'viewer password', {
      email: 'viewer-secret@example.com',
    });
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const [u] = await built.ctx.db
        .insert(users)
        .values({
          username: `racer${i}`,
          displayName: `Racer ${i}`,
          email: `racer${i}@example.com`,
          passwordHash: 'x',
        })
        .returning({ id: users.id });
      ids.push(u!.id);
    }
    const week = weekKey();
    for (let i = 0; i < 25; i++) {
      for (const periodKey of ['all', week]) {
        await built.ctx.db.insert(leaderboardEntries).values({
          periodKey,
          difficulty: 'medium',
          userId: ids[i]!,
          score: 1000 + (i % 10) * 100,
          ticks: 5000 - i,
          stage: 'emerald',
        });
      }
    }
    await built.ctx.db.insert(leaderboardEntries).values({
      periodKey: week,
      difficulty: 'medium',
      userId: viewerUser.id,
      score: 1050,
      ticks: 4000,
      stage: 'emerald',
    });
    // A guest's entry must never appear.
    const [guest] = await built.ctx.db
      .insert(users)
      .values({ displayName: 'Sneaky Guest', isGuest: true })
      .returning({ id: users.id });
    await built.ctx.db.insert(leaderboardEntries).values({
      periodKey: week,
      difficulty: 'medium',
      userId: guest!.id,
      score: 999999,
      ticks: 1,
      stage: 'emerald',
    });

    const page1 = (
      await viewer.get('/api/leaderboards?difficulty=medium&period=weekly&page=1')
    ).json();
    expect(page1.total).toBe(26);
    expect(page1.pageSize).toBe(20);
    expect(page1.entries).toHaveLength(20);
    expect(page1.entries[0].score).toBe(1900);
    // Same score → fewer ticks first.
    expect(page1.entries[0].ticks).toBeLessThan(page1.entries[1].ticks);
    expect(page1.entries.map((e: { rank: number }) => e.rank)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(page1.you).toMatchObject({ displayName: 'Viewer', score: 1050 });
    const page2 = (
      await viewer.get('/api/leaderboards?difficulty=medium&period=weekly&page=2')
    ).json();
    expect(page2.entries).toHaveLength(6);
    expect(page2.entries[0].rank).toBe(21);

    const raw = JSON.stringify(page1) + JSON.stringify(page2);
    expect(raw).not.toMatch(/@example\.com/);
    expect(raw).not.toMatch(/passwordHash|password_hash|username/);
    expect(raw).not.toMatch(/Sneaky Guest/);
  });

  it('validates query parameters', async () => {
    const c = new TestClient(built.app);
    expect((await c.get('/api/leaderboards?difficulty=impossible')).statusCode).toBe(400);
    expect((await c.get('/api/leaderboards?page=0')).statusCode).toBe(400);
  });

  it('serves team standings', async () => {
    const c = new TestClient(built.app);
    const res = await c.get('/api/leaderboards/teams?period=all');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ period: 'all', page: 1, entries: expect.any(Array) });
  });
});
