/**
 * Balance & fairness report.
 *
 * Plays many seeds per difficulty/stage with the look-ahead autopilot and
 * reports catch rate, average catch time, harms and replay determinism.
 *
 *   npm run balance                     # perfect play, 10 seeds each
 *   npm run balance -- --seeds 30       # more seeds
 *   npm run balance -- --mistakes 0.25  # model a sloppier human player
 *   npm run balance -- --no-dash        # never use Fire Dash
 */
import {
  Autopilot,
  ChaseSimulation,
  DIFFICULTY_IDS,
  playWithAutopilot,
  replayRun,
  STAGE_IDS,
  type RunConfig,
} from '../src/index';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seeds = Number(arg('seeds', '10'));
const mistakes = Number(arg('mistakes', '0'));
const useDash = !process.argv.includes('--no-dash');

console.log(`Balance report — ${seeds} seeds, mistakeChance=${mistakes}, dash=${useDash}\n`);
console.log('difficulty stage      caught  avgCatch  min   max   harms  desync  ms');
let totalDesync = 0;
for (const difficulty of DIFFICULTY_IDS) {
  for (const stage of STAGE_IDS) {
    const started = Date.now();
    const times: number[] = [];
    let harms = 0;
    let desync = 0;
    for (let s = 1; s <= seeds; s++) {
      const config: RunConfig = {
        seed: s * 7919,
        difficulty,
        stage,
        abilities: { dash: true, leap: true, shield: true },
      };
      const sim = new ChaseSimulation(config);
      const { inputs } = playWithAutopilot(
        sim,
        new Autopilot({ seed: s, mistakeChance: mistakes, useShield: mistakes > 0, useDash }),
      );
      const r = sim.result();
      const replayed = replayRun(config, inputs);
      if (replayed.score !== r.score || replayed.ticks !== r.ticks) desync++;
      if (r.outcome === 'caught') times.push(r.seconds);
      harms += r.hits + r.pitFalls + r.stumbles + r.mudHits;
    }
    totalDesync += desync;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    console.log(
      `${difficulty.padEnd(10)} ${stage.padEnd(10)} ${`${times.length}/${seeds}`.padEnd(7)} ${avg.toFixed(1).padStart(7)}s ${(times.length ? Math.min(...times) : 0).toFixed(0).padStart(4)}s ${(times.length ? Math.max(...times) : 0).toFixed(0).padStart(4)}s ${String(harms).padStart(6)} ${String(desync).padStart(7)} ${String(Date.now() - started).padStart(5)}`,
    );
  }
}
if (totalDesync > 0) {
  console.error('\nReplay desync detected — determinism is broken!');
  process.exit(1);
}
