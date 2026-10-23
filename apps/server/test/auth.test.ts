import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BuiltApp } from '../src/app';
import { teamMembers, users } from '../src/db/schema';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
beforeAll(async () => {
  built = await createTestApp({ RATE_LIMIT_ENABLED: false });
});
afterAll(async () => built.close());

describe('CSRF and origin protection', () => {
  it('rejects cookie-authenticated state changes without the CSRF token', async () => {
    const c = new TestClient(built.app);
    await c.guest();
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { mode: 'solo', difficulty: 'easy', stage: 'emerald' },
      headers: { cookie: c.cookieHeader() }, // session cookie, but no x-csrf-token header
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF');
    const forged = await built.app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { mode: 'solo', difficulty: 'easy', stage: 'emerald' },
      headers: { cookie: c.cookieHeader(), 'x-csrf-token': 'not-the-cookie-value' },
    });
    expect(forged.statusCode).toBe(403);
  });

  it('rejects requests from foreign origins even with a token', async () => {
    const c = new TestClient(built.app);
    await c.get('/api/auth/csrf');
    const res = await c.request('POST', '/api/auth/guest', {}, { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    const ok = await c.request('POST', '/api/auth/guest', {}, { origin: 'http://localhost:5173' });
    expect(ok.statusCode).toBe(201);
  });
});

describe('header-token sessions (browsers that block cookies)', () => {
  const inject = (
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string> = {},
    payload?: object,
  ) => built.app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

  it('only returns a session token when the client asks for token mode', async () => {
    const normal = await inject('POST', '/api/auth/guest', {}, {});
    expect(normal.statusCode).toBe(201);
    expect(normal.json().sessionToken).toBeUndefined();
    const token = await inject('POST', '/api/auth/guest', { 'x-auth-mode': 'token' }, {});
    expect(token.statusCode).toBe(201);
    expect(token.json().sessionToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('authenticates with an Authorization header and needs no CSRF cookie', async () => {
    const created = await inject('POST', '/api/auth/guest', { 'x-auth-mode': 'token' }, {});
    const { sessionToken, user } = created.json();
    const auth = { authorization: `Bearer ${sessionToken}` };
    const me = await inject('GET', '/api/auth/me', auth);
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(user.id);
    const ticket = await inject('POST', '/api/runs', auth, {
      mode: 'solo',
      difficulty: 'easy',
      stage: 'emerald',
    });
    expect(ticket.statusCode).toBe(201);
    // Cross-site requests are still refused.
    const foreign = await inject(
      'POST',
      '/api/runs',
      { ...auth, origin: 'https://evil.example' },
      { mode: 'solo', difficulty: 'easy', stage: 'emerald' },
    );
    expect(foreign.statusCode).toBe(403);
    // Upgrading keeps the player and rotates the token.
    const up = await inject(
      'POST',
      '/api/auth/upgrade',
      { ...auth, 'x-auth-mode': 'token' },
      { username: 'TokenWing', password: 'token mode password' },
    );
    expect(up.statusCode).toBe(200);
    expect(up.json().user).toMatchObject({ id: user.id, isGuest: false });
    expect((await inject('GET', '/api/auth/me', auth)).statusCode).toBe(401);
    const fresh = { authorization: `Bearer ${up.json().sessionToken}` };
    expect((await inject('GET', '/api/auth/me', fresh)).json().user.username).toBe('TokenWing');
    // Logging out revokes the token.
    expect((await inject('POST', '/api/auth/logout', fresh, {})).statusCode).toBe(204);
    expect((await inject('GET', '/api/auth/me', fresh)).statusCode).toBe(401);
  });

  it('ignores malformed or unknown tokens', async () => {
    expect((await inject('GET', '/api/auth/me', { authorization: 'Bearer nope' })).statusCode).toBe(
      401,
    );
    expect(
      (await inject('GET', '/api/auth/me', { authorization: `Bearer ${'x'.repeat(43)}` }))
        .statusCode,
    ).toBe(401);
    expect((await inject('GET', '/api/auth/me', { authorization: 'Basic abc' })).statusCode).toBe(
      401,
    );
  });
});

describe('guest sessions and accounts', () => {
  it('creates a guest, upgrades it in place and keeps the same player id', async () => {
    const c = new TestClient(built.app);
    const guest = await c.guest();
    const me = await c.get('/api/auth/me');
    expect(me.json().user.isGuest).toBe(true);
    const sid = c.cookies.get('dbfc_sid');
    const up = await c.post('/api/auth/upgrade', {
      username: 'EmberWing',
      password: 'a strong password',
      displayName: 'Ember Wing',
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().user).toMatchObject({
      id: guest.id,
      isGuest: false,
      username: 'EmberWing',
      displayName: 'Ember Wing',
    });
    expect(c.cookies.get('dbfc_sid')).not.toBe(sid); // session rotated
    const again = await c.post('/api/auth/upgrade', {
      username: 'Other',
      password: 'a strong password',
    });
    expect(again.statusCode).toBe(409);
  });

  it('enforces unique, case-insensitive usernames with field errors', async () => {
    const a = new TestClient(built.app);
    await a.register('MossClaw');
    const b = new TestClient(built.app);
    const res = await b.post('/api/auth/register', {
      username: 'mossclaw',
      password: 'another password',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.fieldErrors.username[0]).toMatch(/taken/);
  });

  it('validates input with field errors', async () => {
    const c = new TestClient(built.app);
    const res = await c.post('/api/auth/register', { username: '1x', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
    expect(Object.keys(res.json().error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['username', 'password']),
    );
  });

  it('logs in with username or email and rejects bad passwords generically', async () => {
    const c = new TestClient(built.app);
    await c.register('BarkHide', 'super secret pass', { email: 'bark@example.com' });
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).statusCode).toBe(401);
    const bad = await c.post('/api/auth/login', {
      username: 'barkhide',
      password: 'wrong password!',
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.message).toBe('Invalid username or password.');
    const missing = await c.post('/api/auth/login', {
      username: 'nobody-here',
      password: 'wrong password!',
    });
    expect(missing.json().error.message).toBe('Invalid username or password.');
    expect(
      (
        await c.post('/api/auth/login', {
          username: 'BARK@example.com',
          password: 'super secret pass',
        })
      ).statusCode,
    ).toBe(200);
    expect((await c.get('/api/auth/me')).json().user.username).toBe('BarkHide');
  });

  it('lists and revokes sessions, and logout-all revokes everything', async () => {
    const a = new TestClient(built.app);
    await a.register('TwoDevices', 'device password 1');
    const b = new TestClient(built.app);
    await b.post('/api/auth/login', { username: 'TwoDevices', password: 'device password 1' });
    const list = await a.get('/api/auth/sessions');
    expect(list.json().sessions).toHaveLength(2);
    const other = list.json().sessions.find((s: { current: boolean }) => !s.current);
    expect((await a.del(`/api/auth/sessions/${other.id}`)).statusCode).toBe(204);
    expect((await b.get('/api/auth/me')).statusCode).toBe(401);
    await b.post('/api/auth/login', { username: 'TwoDevices', password: 'device password 1' });
    expect((await a.post('/api/auth/logout-all')).statusCode).toBe(204);
    expect((await a.get('/api/auth/me')).statusCode).toBe(401);
    expect((await b.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('changing the password revokes other sessions', async () => {
    const a = new TestClient(built.app);
    await a.register('PassChanger', 'first password!');
    const b = new TestClient(built.app);
    await b.post('/api/auth/login', { username: 'PassChanger', password: 'first password!' });
    const wrong = await a.post('/api/auth/password', {
      currentPassword: 'nope',
      newPassword: 'second password!',
    });
    expect(wrong.statusCode).toBe(401);
    expect(
      (
        await a.post('/api/auth/password', {
          currentPassword: 'first password!',
          newPassword: 'second password!',
        })
      ).statusCode,
    ).toBe(204);
    expect((await a.get('/api/auth/me')).statusCode).toBe(200);
    expect((await b.get('/api/auth/me')).statusCode).toBe(401);
  });
});

describe('email verification and password reset', () => {
  const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

  it('verifies the email from the link sent on registration', async () => {
    const c = new TestClient(built.app);
    await c.register('Verifier', 'verify password', { email: 'verify@example.com' });
    const mail = built.ctx.mailer.outbox.findLast((m) => m.to === 'verify@example.com');
    expect(mail?.subject).toMatch(/Confirm/);
    expect((await c.get('/api/auth/me')).json().user.emailVerified).toBe(false);
    expect(
      (await c.post('/api/auth/verify-email', { token: tokenFrom(mail!.text) })).statusCode,
    ).toBe(204);
    expect((await c.get('/api/auth/me')).json().user.emailVerified).toBe(true);
    expect(
      (await c.post('/api/auth/verify-email', { token: tokenFrom(mail!.text) })).statusCode,
    ).toBe(400);
  });

  it('resets a forgotten password without revealing whether the account exists', async () => {
    const c = new TestClient(built.app);
    await c.register('Forgetful', 'old password!!', { email: 'forget@example.com' });
    const outsider = new TestClient(built.app);
    const unknown = await outsider.post('/api/auth/forgot', { email: 'nobody@example.com' });
    const known = await outsider.post('/api/auth/forgot', { email: 'forget@example.com' });
    expect(unknown.statusCode).toBe(200);
    expect(known.statusCode).toBe(200);
    expect(unknown.json().ok).toBe(true);
    const mail = built.ctx.mailer.outbox.findLast(
      (m) => m.to === 'forget@example.com' && /Reset/.test(m.subject),
    );
    const token = tokenFrom(mail!.text);
    expect(
      (await outsider.post('/api/auth/reset', { token, password: 'brand new pass' })).statusCode,
    ).toBe(204);
    expect((await c.get('/api/auth/me')).statusCode).toBe(401); // all sessions revoked
    expect(
      (
        await outsider.post('/api/auth/login', {
          username: 'Forgetful',
          password: 'brand new pass',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await outsider.post('/api/auth/reset', { token, password: 'again new pass' })).statusCode,
    ).toBe(400);
  });
});

describe('account deletion', () => {
  it('requires the password and hands team ownership to another member', async () => {
    const owner = new TestClient(built.app);
    const ownerUser = await owner.register('Leaving', 'leaving password');
    const team = (await owner.post('/api/teams', { name: 'Ash Grove', tag: 'ASH' })).json();
    const invite = (await owner.post(`/api/teams/${team.id}/invites`, {})).json();
    const member = new TestClient(built.app);
    const memberUser = await member.register('Staying', 'staying password');
    expect((await member.post(`/api/invites/${invite.code}/accept`)).statusCode).toBe(200);

    expect(
      (await owner.del('/api/auth/account', { confirm: 'DELETE', password: 'wrong' })).statusCode,
    ).toBe(401);
    expect(
      (await owner.del('/api/auth/account', { confirm: 'nope', password: 'leaving password' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await owner.del('/api/auth/account', { confirm: 'DELETE', password: 'leaving password' }))
        .statusCode,
    ).toBe(204);
    expect((await owner.get('/api/auth/me')).statusCode).toBe(401);
    expect(await built.ctx.db.select().from(users).where(eq(users.id, ownerUser.id))).toHaveLength(
      0,
    );
    const roles = await built.ctx.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));
    expect(roles).toEqual([expect.objectContaining({ userId: memberUser.id, role: 'owner' })]);
  });
});
