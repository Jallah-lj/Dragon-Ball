import {
  ChaseSimulation,
  type Course,
  type Obstacle,
  type ObstacleKind,
  type RunConfig,
} from '../src/index';

export const ALL_ABILITIES = { dash: true, leap: true, shield: true };

export function obstacle(
  kind: ObstacleKind,
  x: number,
  w: number,
  y0: number,
  y1: number,
  extra: Partial<Obstacle> = {},
): Obstacle {
  return {
    id: 0,
    kind,
    x,
    w,
    y0,
    y1,
    ground: 0,
    variant: 0,
    speed: 0,
    trigger: 0,
    stopX: 0,
    period: 0,
    phase: 0,
    pivot: x + w / 2,
    ...extra,
  };
}

/** Hand-built flat course for physics tests. */
export function flatCourse(obstacles: Obstacle[] = [], options: Partial<Course> = {}): Course {
  const sorted = obstacles.slice().sort((a, b) => a.x - b.x);
  sorted.forEach((o, i) => (o.id = i));
  const pits: number[] = [];
  for (const o of sorted) if (o.kind === 'gap') pits.push(o.x, o.x + o.w);
  return {
    seed: 1,
    difficulty: 'medium',
    stage: 'emerald',
    tutorial: false,
    length: 5000,
    startGap: 400,
    obstacles: sorted,
    collectibles: [],
    terrainX: [-100, 10000],
    terrainH: [0, 0],
    pits,
    hover: [3],
    decorSeed: 1,
    ...options,
  };
}

export function makeSim(course: Course, config: Partial<RunConfig> = {}): ChaseSimulation {
  return new ChaseSimulation(
    { seed: 1, difficulty: 'medium', stage: 'emerald', abilities: ALL_ABILITIES, ...config },
    course,
  );
}

/** Step until the predicate holds (or a tick budget runs out). */
export function stepUntil(
  sim: ChaseSimulation,
  predicate: (s: ChaseSimulation) => boolean,
  max = 6000,
): void {
  for (let i = 0; i < max && !sim.over && !predicate(sim); i++) sim.step();
}

export function stepN(sim: ChaseSimulation, n: number): void {
  for (let i = 0; i < n && !sim.over; i++) sim.step();
}
