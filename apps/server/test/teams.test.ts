import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BuiltApp } from '../src/app';
import { teamInvites } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: false });
});
afterAll(async () => built.close());

async function account(name: string) {
  const c = new TestClient(built.app);
  const user = await c.register(name);
  return { c, user };
}

describe('team management', () => {
  it('creates teams with unique names and tags; guests cannot', async () => {
    const { c } = await account('Founder');
    const res = await c.post('/api/teams', {
      name: 'Emerald Wings',
      tag: 'emw',
      description: 'We fly low.',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'Emerald Wings',
      tag: 'EMW',
      yourRole: 'owner',
      memberCount: 1,
      maxMembers: 8,
    });
    const { c: c2 } = await account('Copycat');
    const dupName = await c2.post('/api/teams', { name: 'emerald wings', tag: 'XYZ' });
    expect(dupName.statusCode).toBe(409);
    expect(dupName.json().error.details.fieldErrors.name).toBeDefined();
    const dupTag = await c2.post('/api/teams', { name: 'Other Wings', tag: 'EMW' });
    expect(dupTag.json().error.details.fieldErrors.tag).toBeDefined();
    expect(
      (await c.post('/api/teams', { name: 'Second Team', tag: 'TWO' })).json().error.code,
    ).toBe('ALREADY_IN_TEAM');
    const guest = new TestClient(built.app);
    await guest.guest();
    expect(
      (await guest.post('/api/teams', { name: 'Guest Team', tag: 'GST' })).json().error.code,
    ).toBe('GUEST_NOT_ALLOWED');
  });

  it('handles invites, roles, full teams, expiry, revocation and leaving', async () => {
    const owner = await account('Owner1');
    const team = (await owner.c.post('/api/teams', { name: 'Ironbark', tag: 'IRB' })).json();
    expect(
      (await owner.c.patch(`/api/teams/${team.id}`, { maxMembers: 3 })).json().maxMembers,
    ).toBe(3);

    const inv = await owner.c.post(`/api/teams/${team.id}/invites`, {
      expiresInHours: 24,
      maxUses: 5,
    });
    expect(inv.statusCode).toBe(201);
    const code = inv.json().code as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // Public preview works without signing in.
    const anon = new TestClient(built.app);
    expect((await anon.get(`/api/invites/${code}`)).json()).toMatchObject({
      status: 'valid',
      team: { name: 'Ironbark', memberCount: 1 },
    });
    expect((await anon.post(`/api/invites/${code}/accept`)).statusCode).toBe(401);

    const a = await account('MemberA');
    const b = await account('MemberB');
    const c = await account('MemberC');
    expect((await a.c.post(`/api/invites/${code}/accept`)).json().yourRole).toBe('member');
    expect((await a.c.post(`/api/invites/${code}/accept`)).json().error.code).toBe(
      'ALREADY_IN_TEAM',
    );
    expect((await b.c.post(`/api/invites/${code}/accept`)).statusCode).toBe(200);
    // Team is now full (3/3).
    expect((await anon.get(`/api/invites/${code}`)).json().status).toBe('full');
    const full = await c.c.post(`/api/invites/${code}/accept`);
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('TEAM_FULL');
    expect((await owner.c.patch(`/api/teams/${team.id}`, { maxMembers: 2 })).statusCode).toBe(409);

    // Members can't invite or remove; captains can remove members only.
    expect((await a.c.post(`/api/teams/${team.id}/invites`, {})).statusCode).toBe(403);
    expect((await a.c.del(`/api/teams/${team.id}/members/${b.user.id}`)).statusCode).toBe(403);
    expect(
      (await a.c.patch(`/api/teams/${team.id}/members/${b.user.id}`, { role: 'captain' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await owner.c.patch(`/api/teams/${team.id}/members/${a.user.id}`, { role: 'captain' }))
        .json()
        .members.find((m: { userId: string }) => m.userId === a.user.id).role,
    ).toBe('captain');
    expect((await a.c.post(`/api/teams/${team.id}/invites`, {})).statusCode).toBe(201);
    expect((await a.c.del(`/api/teams/${team.id}/members/${owner.user.id}`)).statusCode).toBe(403);
    expect((await a.c.del(`/api/teams/${team.id}/members/${b.user.id}`)).statusCode).toBe(204);

    // Expired and revoked invites.
    const late = (await owner.c.post(`/api/teams/${team.id}/invites`, {})).json().code as string;
    await built.ctx.db
      .update(teamInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(teamInvites.code, late));
    expect((await anon.get(`/api/invites/${late}`)).json().status).toBe('expired');
    const expired = await c.c.post(`/api/invites/${late}/accept`);
    expect(expired.statusCode).toBe(410);
    expect(expired.json().error.code).toBe('INVITE_EXPIRED');
    const revoked = (await owner.c.post(`/api/teams/${team.id}/invites`, {})).json().code as string;
    expect((await owner.c.del(`/api/teams/${team.id}/invites/${revoked}`)).statusCode).toBe(204);
    expect((await c.c.post(`/api/invites/${revoked}/accept`)).json().error.code).toBe(
      'INVITE_INVALID',
    );
    expect((await c.c.post('/api/invites/ZZZZZZZZ/accept')).json().error.code).toBe(
      'INVITE_INVALID',
    );
    expect((await c.c.post('/api/invites/bad/accept')).statusCode).toBe(400);

    // Invites are only visible to owners and captains.
    expect((await owner.c.get(`/api/teams/${team.id}`)).json().invites.length).toBeGreaterThan(0);
    const outsiderView = (await c.c.get(`/api/teams/${team.id}`)).json();
    expect(outsiderView.invites).toBeUndefined();
    expect(outsiderView.yourRole).toBeNull();

    // Owner must transfer before leaving; transfer makes the old owner a captain.
    expect((await owner.c.post(`/api/teams/${team.id}/leave`)).json().error.code).toBe(
      'OWNER_MUST_TRANSFER',
    );
    const transferred = await owner.c.patch(`/api/teams/${team.id}/members/${a.user.id}`, {
      role: 'owner',
    });
    expect(transferred.json().yourRole).toBe('captain');
    expect((await owner.c.post(`/api/teams/${team.id}/leave`)).json()).toEqual({
      disbanded: false,
    });
    expect((await owner.c.get('/api/teams/mine')).json().team).toBeNull();
    // Last member leaving disbands the team.
    expect((await a.c.post(`/api/teams/${team.id}/leave`)).json()).toEqual({ disbanded: true });
    expect((await a.c.get(`/api/teams/${team.id}`)).statusCode).toBe(404);
  });

  it('only the owner can disband', async () => {
    const owner = await account('Owner2');
    const team = (await owner.c.post('/api/teams', { name: 'Thornguard', tag: 'THN' })).json();
    const code = (await owner.c.post(`/api/teams/${team.id}/invites`, {})).json().code;
    const m = await account('Member2');
    await m.c.post(`/api/invites/${code}/accept`);
    expect((await m.c.del(`/api/teams/${team.id}`)).statusCode).toBe(403);
    expect((await owner.c.del(`/api/teams/${team.id}`)).statusCode).toBe(204);
    expect((await m.c.get('/api/teams/mine')).json().team).toBeNull();
  });
});
