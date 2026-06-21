/**
 * Feel knobs — everything that governs the FEEL, gathered in one place.
 * This is the most important file in the project. Tune here, not scattered across the code.
 * The values below are starting points; we adjust until the drop and bounce feel true.
 */

export const FEEL = {
  /** Normal Earth gravity. (The panel slider can pull harder for a "firmer" feel.) */
  gravity: -9.82,

  /** Rigid objects — almost no bounce. */
  restitution: 0.1,

  /** Friction between shapes and against the board. */
  friction: 0.42,

  /** Throws coast and settle without sticking. */
  linearDamping: 0.12,
  angularDamping: 0.12,

  /**
   * Grip strength (M2). Constant, NOT mass-scaled — that is the whole point:
   * the acceleration ceiling F/m is lower for heavy shapes → they lag = feel heavy.
   */
  gripMaxForce: 500,

  /** Solver iterations. High (~14) is needed for stable chain constraints later. */
  solverIterations: 14,

  /** Resting shapes fall asleep (looks good + saves CPU). Wake on grip/detonate. */
  allowSleep: true,
} as const;

export const SIM = {
  /** Fixed timestep — physics stays stable regardless of FPS. */
  fixedTimeStep: 1 / 60,
  /** Max substeps per frame. */
  maxSubSteps: 3,
  /** Clamp on the frame delta so a lag spike does not blow up the simulation. */
  maxDelta: 0.05,
} as const;

/** Matte, harmonious palette — matte > glossy, keeps the scene "clean". */
export const PALETTE = {
  background: 0x0c0e11,
  board: 0x1a1f25,
  grid: 0x2b333c,
  warmWhite: 0xf2ece1,
  teal: 0x4fb6a8,
  coral: 0xe07a5f,
  indigo: 0x5566a8,
  amber: 0xd9a14a,
  slate: 0x7a8794,
} as const;
