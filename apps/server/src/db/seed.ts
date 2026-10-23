/**
 * Seed workflow: creates demo accounts, a team and leaderboard data.
 *
 * Every seeded score comes from a real run: the autopilot plays the
 * deterministic simulation and the input log goes through the same
 * server-side verification as a player's run. Re-running is idempotent.
 *
 *   npm run db:seed              # uses DATABASE_URL
 *   SEED_PASSWORD=... npm run db:seed
 */
import { eq } from 'drizzle-orm';
import {
  Autopilot,
  ChaseSimulation,
  playWithAutopilot,
  type Difficulty,
  type StageId,
} from '@dbfc/shared';
import { loadConfig } from '../config';
import type { AppContext } from '../context';
import { hashPassword } from '../lib/password';
import { randomToken } from '../lib/crypto';
import { completeRun, createRunTicket } from '../services/runs';
import { acceptInvite, createInvite, createTeam } from '../services/teams';
import { createDatabase } from './client';
import { users } from './schema';

const PLAYERS: { username: string; displayName: string; skin: string; skill: number }[] = [
  { username: 'ashwing', displayName: 'Ashwing', skin: 'emberscale', skill: 0.02 },
  { username: 'mossclaw', displayName: 'Mossclaw', skin: 'mossback', skill: 0.08 },
  { username: 'barktail', displayName: 'Barktail', skin: 'barkhide', skill: 0.15 },
  { username: 'emberlynn', displayName: 'Emberlynn', skin: 'emberscale', skill: 0.05 },
  { username: 'fernstride', displayName: 'Fernstride', skin: 'mossback', skill: 0.25 },
];

async function main() {
  const config = loadConfig({ ...process.env, RUN_MIN_WALLCLOCK_RATIO: '0' });
  const database = await createDatabase(config.DATABASE_URL, config.MIGRATIONS_DIR);
  await database.migrate();
  const log = {
    info: () => undefined,
    warn: console.warn,
    error: console.error,
  } as unknown as AppContext['log'];
  const ctx: AppContext = {
    config,
    database,
    db: database.db,
    mailer: { enabled: false, outbox: [], send: async () => undefined },
    redis: null,
    log,
    onSessionsRevoked: () => undefined,
  };
  const password = process.env.SEED_PASSWORD ?? randomToken(9);
  const created: string[] = [];

  for (const p of PLAYERS) {
    const existing = await ctx.db
      .select()
      .from(users)
      .where(eq(users.username, p.username))
      .limit(1);
    if (existing[0]) continue;
    const [user] = await ctx.db
      .insert(users)
      .values({
        username: p.username,
        displayName: p.displayName,
        passwordHash: await hashPassword(password),
        avatar: p.skin,
        selectedSkin: p.skin,
      })
      .returning();
    created.push(p.username);
    // Play a ladder of verified runs: Easy → Medium → Hard as they unlock.
    const plan: [Difficulty, StageId][] = [
      ['easy', 'emerald'],
      ['medium', 'emerald'],
      ['medium', 'mistpine'],
      ['hard', 'emerald'],
    ];
    for (const [difficulty, stage] of plan) {
      let ticket;
      try {
        ticket = await createRunTicket(ctx, user!, { mode: 'solo', difficulty, stage });
      } catch {
        continue; // still locked
      }
      const sim = new ChaseSimulation({
        seed: ticket.seed,
        difficulty: ticket.difficulty,
        stage: ticket.stage,
        abilities: ticket.abilities,
      });
      const { inputs } = playWithAutopilot(
        sim,
        new Autopilot({ seed: user!.username!.length * 31, mistakeChance: p.skill }),
      );
      const r = sim.result();
      await completeRun(ctx, user!.id, ticket.runId, {
        inputs,
        claimed: { score: r.score, ticks: r.ticks, outcome: r.outcome },
      });
    }
    console.log(`Seeded ${p.displayName}`);
  }

  if (created.includes('ashwing')) {
    const [owner] = await ctx.db.select().from(users).where(eq(users.username, 'ashwing'));
    const teamId = await createTeam(ctx, owner!, {
      name: 'Ember Wardens',
      tag: 'EMBR',
      description: 'Demo team created by the seed script.',
    });
    const invite = await createInvite(ctx, owner!, teamId, { expiresInHours: 168, maxUses: 10 });
    for (const name of ['mossclaw', 'emberlynn']) {
      const [member] = await ctx.db.select().from(users).where(eq(users.username, name));
      if (member) await acceptInvite(ctx, member, invite.code);
    }
    console.log(`Team "Ember Wardens" created — invite code ${invite.code}`);
  }

  if (created.length) {
    console.log(`\nDemo accounts: ${created.join(', ')}`);
    console.log(
      process.env.SEED_PASSWORD
        ? 'Password: (from SEED_PASSWORD)'
        : `Password for all demo accounts: ${password}`,
    );
  } else {
    console.log('Demo data already present — nothing to do.');
  }
  await database.close();
}

await main();
