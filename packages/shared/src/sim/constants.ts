/**
 * Core simulation constants.
 *
 * Every gameplay-relevant number lives here so that the browser client, the
 * server-side replay verifier and the balance tooling all agree exactly.
 * Units: metres, seconds, ticks (1 tick = 1/60 s).
 */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Hard safety cap for a single run (15 minutes of simulated time). */
export const MAX_RUN_TICKS = TICK_RATE * 60 * 15;

/** Maximum number of recorded input events accepted for one run. */
export const MAX_INPUT_EVENTS = 24_000;

export const PHYSICS = {
  /** Gravity while rising with the jump button held (gives variable jump height). */
  gravityRise: 30,
  /** Gravity when falling or after the jump button is released. */
  gravityFall: 46,
  jumpVelocity: 11,
  /** Forest Leap (mid-air wing beat) launch velocity. */
  leapVelocity: 10.4,
  /** A jump always behaves as "held" for this many ticks, so taps still clear small hazards. */
  minJumpHoldTicks: 6,
  /** Upward velocity multiplier applied when the jump button is released early. */
  jumpCutFactor: 0.5,
  fastFallVelocity: -17,
  maxFallSpeed: -26,
  /** Grace period after running off an edge during which a jump still works. */
  coyoteTicks: 6,
  /** A jump pressed slightly before landing is remembered for this many ticks. */
  jumpBufferTicks: 8,
  /** A tap on slide keeps the dragon low for this long. */
  slideBaseTicks: 36,
  /** Holding slide extends it up to this long. */
  slideMaxTicks: 78,
  /** Fraction of the (target - current) speed difference applied each tick. */
  speedResponse: 0.08,
  /** Upward velocity of the rescue wing-flap after falling into a gap. */
  rescueVelocity: 9.5,
  /** Depth below the rim at which a fall into a gap is considered committed. */
  pitFallDepth: 0.9,
} as const;

export const DRAGON = {
  standHalfWidth: 0.72,
  standHeight: 1.3,
  slideHalfWidth: 0.92,
  slideHeight: 0.66,
  /** Half-width of the support span used to decide whether the dragon stands on ground. */
  footHalfWidth: 0.45,
  /** Extra reach when collecting pickups (forgiving). */
  pickupPadding: 0.4,
} as const;

export const ABILITIES = {
  dash: { durationTicks: 72, cooldownTicks: 240, energyCost: 50, speedMult: 1.4 },
  leap: { cooldownTicks: 300 },
  shield: { durationTicks: 480, cooldownTicks: 1200 },
} as const;

export const ENERGY = { max: 100, start: 50, orb: 4, crystal: 2 } as const;

export const FLOW = {
  max: 10,
  perClear: 1,
  perOrb: 0.15,
  speedPerLevel: 0.012,
  stumblePenalty: 3,
  mudPenalty: 2,
} as const;

export const HIT = { invulnTicks: 72, speedFactor: 0.55, shieldInvulnTicks: 36 } as const;
export const STUMBLE = { ticks: 36, speedFactor: 0.7 } as const;
export const MUD = { speedFactor: 0.62 } as const;
export const BOOST = { ticks: 180, speedMult: 1.25 } as const;

/** Horizontal distance at which the dragon catches the fireball. */
export const CATCH_DISTANCE = 1.2;

export const FIREBALL = {
  /** Fireball eases off when the dragon falls this far behind its starting gap… */
  rubberBandSlack: 8,
  /** …by up to this fraction of base speed. */
  rubberBandMax: 0.06,
  rubberBandRange: 20,
  /** When cornered (gap below this), the fireball flares and speeds up slightly. */
  corneredGap: 10,
  corneredBoost: 0.035,
  /** The fireball tires over time so persistent clean play always converges. */
  fatiguePerSecond: 0.0003,
  fatigueMax: 0.05,
} as const;

export const SCORE = {
  orb: 10,
  crystal: 25,
  scale: 250,
  pickup: 20,
  clearBase: 15,
  clearFlowBonus: 1.5,
  thornBurn: 30,
  catchBonus: 1000,
  heartBonus: 150,
  timeBonusPerSecond: 10,
} as const;

/**
 * Swinging vine-log: a log hung from vines that swings toward and away from the
 * camera. Seen from the side it rises and dips in place.
 *
 * Fairness rule for periodic hazards in an auto-runner (the player cannot
 * change arrival time): one response must work at every phase. Sliding always
 * passes under the swing (its lowest point stays above the sliding dragon);
 * running upright only works while it is swung high.
 */
export const SWING = {
  logWidth: 1.3,
  logHeight: 0.55,
  /** Log bottom at the low point of the swing (m above ground). */
  lowBottom: 0.72,
  /** Additional height at the high points of the swing (m). */
  lift: 1.2,
} as const;

/** Wisp snare timing (ticks within its period). */
export const SNARE = {
  /** The snare is dangerous during the final `activeTicks` of each period. */
  activeTicks: 40,
  /** Visual warning precedes the active phase by this many ticks. */
  warningTicks: 24,
  activeHeight: 1.15,
} as const;
