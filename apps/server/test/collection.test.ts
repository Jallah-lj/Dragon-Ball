import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BuiltApp } from '../src/app';
import { achievements, users } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: false });
});
afterAll(async () => built.close());

describe('collection', () => {
  it('buys skins with crystals atomically and equips owned skins only', async () => {
    const c = new TestClient(built.app);
    const user = await c.register('Collector');
    const col = (await c.get('/api/collection')).json();
    expect(col.skins.find((s: { id: string }) => s.id === 'emberscale')).toMatchObject({
      owned: true,
      equipped: true,
    });
    const poor = await c.post('/api/collection/skins/mossback/purchase');
    expect(poor.statusCode).toBe(409);
    expect(poor.json().error.code).toBe('INSUFFICIENT_CRYSTALS');
    expect((await c.post('/api/collection/skins/mossback/equip', {})).statusCode).toBe(403);

    await built.ctx.db.update(users).set({ crystals: 200 }).where(eq(users.id, user.id));
    const bought = await c.post('/api/collection/skins/mossback/purchase');
    expect(bought.statusCode).toBe(200);
    expect(bought.json().crystals).toBe(50);
    expect((await c.post('/api/collection/skins/mossback/purchase')).statusCode).toBe(409);
    const equipped = await c.post('/api/collection/skins/mossback/equip', { avatar: true });
    expect(equipped.json()).toMatchObject({ selectedSkin: 'mossback', avatar: 'mossback' });
    expect((await c.post('/api/collection/skins/goldcrest/purchase')).statusCode).toBe(400);
    expect((await c.post('/api/collection/skins/not-a-skin/equip', {})).statusCode).toBe(400);
  });

  it('achievement skins unlock with their achievement', async () => {
    const c = new TestClient(built.app);
    const user = await c.register('Untouchable1');
    expect((await c.post('/api/collection/skins/duskwing/equip', {})).statusCode).toBe(403);
    await built.ctx.db
      .insert(achievements)
      .values({ userId: user.id, achievementId: 'untouchable' });
    expect((await c.post('/api/collection/skins/duskwing/equip', {})).statusCode).toBe(200);
    const profile = (
      await c.patch('/api/profile', { avatar: 'duskwing', displayName: '  Dusk   Runner ' })
    ).json();
    expect(profile.user).toMatchObject({ avatar: 'duskwing', displayName: 'Dusk Runner' });
    expect((await c.patch('/api/profile', { avatar: 'goldcrest' })).statusCode).toBe(403);
  });

  it('syncs settings and serves public profiles without private data', async () => {
    const c = new TestClient(built.app);
    const user = await c.register('Settler', 'settler password', { email: 'settler@example.com' });
    expect(
      (
        await c.put('/api/settings', {
          settings: { musicVolume: 0.3, keybinds: { jump: ['KeyJ'] } },
        })
      ).statusCode,
    ).toBe(200);
    expect((await c.get('/api/settings')).json().settings).toMatchObject({ musicVolume: 0.3 });
    const pub = await new TestClient(built.app).get(`/api/users/${user.id}`);
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ displayName: 'Settler', level: 1 });
    expect(JSON.stringify(pub.json())).not.toMatch(/settler@example.com|username/);
    expect((await c.get('/api/users/not-a-uuid')).statusCode).toBe(404);
  });
});
