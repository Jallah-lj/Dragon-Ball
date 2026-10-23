/**
 * Input-log validation and headless replay.
 *
 * The client records every input as a (tick, code) pair at the tick it was
 * applied. The server validates the log's shape and replays it through the
 * same ChaseSimulation to compute the authoritative result.
 */
import { MAX_INPUT_EVENTS, MAX_RUN_TICKS } from './constants';
import type { Course } from './course';
import { ChaseSimulation, INPUT_CODES, type RunConfig, type RunResult } from './simulation';

export type InputValidation = { ok: true; inputs: number[] } | { ok: false; reason: string };

/** Maximum events accepted within a single tick (two hands, generous). */
const MAX_EVENTS_PER_TICK = 6;

export function validateInputs(raw: unknown, maxTick = MAX_RUN_TICKS): InputValidation {
  if (!Array.isArray(raw)) return { ok: false, reason: 'inputs must be an array' };
  if (raw.length % 2 !== 0) return { ok: false, reason: 'inputs must be [tick, code] pairs' };
  if (raw.length / 2 > MAX_INPUT_EVENTS) return { ok: false, reason: 'too many input events' };
  let lastTick = -1;
  let perTick = 0;
  const out: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i += 2) {
    const tick = raw[i] as unknown;
    const code = raw[i + 1] as unknown;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0 || tick > maxTick) {
      return { ok: false, reason: `invalid tick at index ${i}` };
    }
    if (typeof code !== 'number' || !INPUT_CODES.includes(code)) {
      return { ok: false, reason: `invalid input code at index ${i + 1}` };
    }
    if (tick < lastTick) return { ok: false, reason: 'input ticks must be non-decreasing' };
    perTick = tick === lastTick ? perTick + 1 : 1;
    if (perTick > MAX_EVENTS_PER_TICK) return { ok: false, reason: 'too many inputs in one tick' };
    lastTick = tick;
    out[i] = tick;
    out[i + 1] = code;
  }
  return { ok: true, inputs: out };
}

/** Replay a validated input log and return the authoritative result. */
export function replayRun(
  config: RunConfig,
  inputs: readonly number[],
  course?: Course,
): RunResult {
  const sim = new ChaseSimulation(config, course);
  sim.recordEvents = false;
  let k = 0;
  while (!sim.over) {
    while (k < inputs.length && inputs[k] === sim.tick) {
      sim.input(inputs[k + 1]!);
      k += 2;
    }
    sim.step();
  }
  return sim.result();
}

/** Records inputs exactly as they are applied to a live simulation. */
export class InputRecorder {
  private readonly log: number[] = [];

  record(tick: number, code: number): void {
    this.log.push(tick, code);
  }

  get length(): number {
    return this.log.length / 2;
  }

  toArray(): number[] {
    return this.log.slice();
  }

  clear(): void {
    this.log.length = 0;
  }
}
