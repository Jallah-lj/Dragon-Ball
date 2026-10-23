/**
 * Look-ahead autopilot.
 *
 * Plays the deterministic simulation by cloning it and testing candidate input
 * plans, with a two-step search for combos (e.g. hop a rock, then immediately
 * hop a log). Used for:
 *  - the animated attract-mode chase behind the main menu;
 *  - fairness tests proving generated courses are clearable;
 *  - balance tooling (with injected timing mistakes to model human players);
 *  - end-to-end browser tests (test builds only).
 */
import { Rng } from './rng';
import { type ChaseSimulation, INPUT } from './simulation';

export interface AutopilotOptions {
  /** Probability that a chosen plan is executed with sloppy timing (0 = perfect). */
  mistakeChance?: number;
  /** Maximum timing error in ticks when a mistake happens. */
  mistakeTicks?: number;
  /** Use Fire Dash when charged. */
  useDash?: boolean;
  /** Use Dragon Shield when a hit is unavoidable. */
  useShield?: boolean;
  /** Danger-detection horizon (ticks). */
  horizon?: number;
  /** After a plan settles, the dragon must stay unharmed this long (ticks). */
  leafHorizon?: number;
  seed?: number;
}

interface PlannedInput {
  at: number;
  code: number;
}

type Plan = PlannedInput[];

function badCount(sim: ChaseSimulation): number {
  const s = sim.stats;
  return s.hits + s.stumbles + s.pitFalls + s.mudHits + s.shieldBlocks;
}

/** Steps `sim` with no input; returns ticks until harm (Infinity if none). */
function idleSafety(sim: ChaseSimulation, ticks: number): number {
  const c = sim.clone();
  c.recordEvents = false;
  const bad0 = badCount(c);
  for (let i = 1; i <= ticks && !c.over; i++) {
    c.step();
    if (badCount(c) !== bad0 || c.outcome === 'defeated') return i;
  }
  return Infinity;
}

/**
 * Execute a plan on a clone until it settles (last input applied and the
 * dragon is back on the ground). Returns the clone, or null if harm occurred.
 */
function runPlan(sim: ChaseSimulation, plan: Plan): ChaseSimulation | null {
  const c = sim.clone();
  c.recordEvents = false;
  const bad0 = badCount(c);
  const last = plan.length > 0 ? plan[plan.length - 1]!.at : c.tick;
  let k = 0;
  for (let guard = 0; guard < 240 && !c.over; guard++) {
    while (k < plan.length && plan[k]!.at <= c.tick) c.input(plan[k++]!.code);
    c.step();
    if (badCount(c) !== bad0 || c.outcome === 'defeated') return null;
    if (k >= plan.length && c.tick > last && c.grounded && !c.sliding) break;
  }
  return c;
}

export class Autopilot {
  private plan: Plan = [];
  private safeUntil = -1;
  private readonly rng: Rng;
  private readonly opts: Required<AutopilotOptions>;

  constructor(options: AutopilotOptions = {}) {
    this.opts = {
      mistakeChance: options.mistakeChance ?? 0,
      mistakeTicks: options.mistakeTicks ?? 8,
      useDash: options.useDash ?? true,
      useShield: options.useShield ?? true,
      horizon: options.horizon ?? 50,
      leafHorizon: options.leafHorizon ?? 22,
      seed: options.seed ?? 1,
    };
    this.rng = new Rng(this.opts.seed);
  }

  reset(): void {
    this.plan = [];
    this.safeUntil = -1;
  }

  /** Returns the input codes to apply before the next `sim.step()`. */
  decide(sim: ChaseSimulation): number[] {
    const out: number[] = [];
    const t = sim.tick;
    while (this.plan.length > 0 && this.plan[0]!.at <= t) out.push(this.plan.shift()!.code);
    // Never plan on a tick where inputs are being emitted: look-ahead clones would
    // not yet include them. Re-evaluate on the next tick instead.
    if (out.length > 0 || this.plan.length > 0 || sim.over) return out;

    if (t < this.safeUntil) {
      this.maybeDash(sim, out);
      return out;
    }

    const H = this.opts.horizon;
    const idle = idleSafety(sim, H);
    if (idle === Infinity) {
      this.safeUntil = t + Math.max(1, H - 16);
      this.maybeDash(sim, out);
      return out;
    }

    // One-step search: a single plan followed by idling is safe.
    const best = this.search(sim, 0);
    if (best) {
      this.commit(this.maybeMistake(best, t), t, out);
      return out;
    }
    // Two-step search for combos, only once the hazard is close enough to matter.
    if (idle <= 40) {
      const combo = this.search(sim, 1);
      if (combo) {
        this.commit(this.maybeMistake(combo, t), t, out);
        return out;
      }
    }
    if (idle > 4) return out; // wait a tick and re-plan

    if (this.opts.useShield && sim.shieldReady) {
      out.push(INPUT.Shield);
      return out;
    }
    // Unavoidable: pick the plan that delays harm the longest.
    let fallback: Plan | null = null;
    let latest = idle;
    for (const candidate of this.candidates(sim)) {
      const c = sim.clone();
      c.recordEvents = false;
      const bad0 = badCount(c);
      let k = 0;
      let i = 0;
      for (; i < 120 && !c.over; i++) {
        while (k < candidate.length && candidate[k]!.at <= c.tick) c.input(candidate[k++]!.code);
        c.step();
        if (badCount(c) !== bad0) break;
      }
      if (i > latest) {
        latest = i;
        fallback = candidate;
      }
    }
    if (fallback) this.commit(fallback, t, out);
    return out;
  }

  /** Best plan (by pickups gained) that leads to a safe state within `depth` follow-ups. */
  private search(sim: ChaseSimulation, depth: number): Plan | null {
    let best: Plan | null = null;
    let bestScore = -Infinity;
    for (const candidate of this.candidates(sim)) {
      const after = runPlan(sim, candidate);
      if (!after) continue;
      if (!this.safeFrom(after, depth)) continue;
      const duration = after.tick - sim.tick;
      const score = after.stats.points - sim.stats.points - duration * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
        if (depth > 0) break; // combos: first workable plan is good enough
      }
    }
    return best;
  }

  /** Can the dragon stay safe from this state, using up to `depth` more plans? */
  private safeFrom(sim: ChaseSimulation, depth: number): boolean {
    const H = this.opts.leafHorizon;
    const idle = idleSafety(sim, H);
    if (idle === Infinity) return true;
    if (depth <= 0) return false;
    // Try follow-up plans started after waiting 0..idle-1 ticks.
    const probe = sim.clone();
    probe.recordEvents = false;
    for (let wait = 0; wait < idle; wait += 2) {
      for (const candidate of this.candidates(probe)) {
        const after = runPlan(probe, candidate);
        if (after && idleSafety(after, H) === Infinity) return true;
      }
      probe.step();
      probe.step();
      if (probe.over) return probe.outcome !== 'defeated';
    }
    return false;
  }

  private commit(plan: Plan, t: number, out: number[]): void {
    this.plan = plan.slice();
    while (this.plan.length > 0 && this.plan[0]!.at <= t) out.push(this.plan.shift()!.code);
    this.safeUntil = -1;
  }

  private maybeMistake(plan: Plan, t: number): Plan {
    if (this.opts.mistakeChance <= 0 || !this.rng.chance(this.opts.mistakeChance)) return plan;
    const m = this.opts.mistakeTicks;
    let delta = this.rng.int(-m, m);
    if (delta === 0) delta = m;
    // Late reactions are more common than early ones for humans.
    if (delta < 0 && this.rng.chance(0.5)) delta = -delta;
    return plan.map((p) => ({ at: Math.max(t, p.at + delta), code: p.code }));
  }

  private maybeDash(sim: ChaseSimulation, out: number[]): void {
    if (!this.opts.useDash || !sim.dashReady) return;
    const plan: Plan = [{ at: sim.tick, code: INPUT.Dash }];
    const c = runPlan(sim, plan);
    if (c && idleSafety(c, this.opts.leafHorizon + 8) === Infinity) {
      out.push(INPUT.Dash);
      this.safeUntil = -1;
    }
  }

  private candidates(sim: ChaseSimulation): Plan[] {
    const t = sim.tick;
    const list: Plan[] = [];
    const jump = (hold: number): Plan => [
      { at: t, code: INPUT.JumpDown },
      { at: t + hold, code: INPUT.JumpUp },
    ];
    if (sim.grounded || sim.coyote > 0) {
      for (const hold of [6, 10, 14, 20, 28, 36]) list.push(jump(hold));
      for (const hold of [36, 54, 78]) {
        list.push([
          { at: t, code: INPUT.SlideDown },
          { at: t + hold, code: INPUT.SlideUp },
        ]);
      }
      // Jump, then fast-fall into a slide (jump → duck combos).
      for (const [hold, ff] of [
        [8, 14],
        [14, 22],
        [20, 30],
      ] as const) {
        list.push([
          { at: t, code: INPUT.JumpDown },
          { at: t + hold, code: INPUT.JumpUp },
          { at: t + ff, code: INPUT.SlideDown },
          { at: t + ff + 46, code: INPUT.SlideUp },
        ]);
      }
      // Jump + Forest Leap for long gaps and high pickups.
      if (sim.leapReady) {
        for (const [hold, leapAt] of [
          [36, 22],
          [36, 30],
          [14, 18],
        ] as const) {
          list.push([
            { at: t, code: INPUT.JumpDown },
            { at: t + Math.min(hold, leapAt - 1), code: INPUT.JumpUp },
            { at: t + leapAt, code: INPUT.JumpDown },
            { at: t + leapAt + 24, code: INPUT.JumpUp },
          ]);
        }
      }
    } else {
      // Airborne: a Forest Leap or a fast-fall can rescue the situation.
      if (sim.leapReady) {
        list.push(jump(12));
        list.push(jump(26));
      }
      list.push([
        { at: t, code: INPUT.SlideDown },
        { at: t + 2, code: INPUT.SlideUp },
      ]);
      list.push([
        { at: t, code: INPUT.SlideDown },
        { at: t + 50, code: INPUT.SlideUp },
      ]);
    }
    if (sim.dashReady) list.push([{ at: t, code: INPUT.Dash }]);
    return list;
  }
}

/** Convenience: play a whole run with the autopilot and return the input log. */
export function playWithAutopilot(
  sim: ChaseSimulation,
  pilot: Autopilot = new Autopilot(),
  maxTicks = Infinity,
): { inputs: number[] } {
  const inputs: number[] = [];
  while (!sim.over && sim.tick < maxTicks) {
    for (const code of pilot.decide(sim)) {
      inputs.push(sim.tick, code);
      sim.input(code);
    }
    sim.step();
  }
  return { inputs };
}
