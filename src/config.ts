/**
 * Feel knobs — everything that governs the FEEL, gathered in one place.
 * This is the most important file in the project. Tune here, not scattered across the code.
 * The values below are starting points; we adjust until the drop and bounce feel true.
 */

export const FEEL = {
  /** A notch harder than Earth's 9.82 → firmer, more "weighty" feel (vision sweet spot). */
  gravity: -20,

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

  /** Solver iterations. High count keeps stacks stable and stops chain links from
   *  being forced through each other when pulled hard. */
  solverIterations: 30,

  /** Contact stiffness/relaxation — a bit stiffer than cannon's 1e7 default so rigid
   *  rings resist being squeezed through one another, but low enough to stay stable
   *  at a 1/60 timestep (too high → the solver explodes). */
  contactStiffness: 2e7,
  contactRelaxation: 3,

  /** Resting shapes fall asleep (looks good + saves CPU). Wake on grip/detonate. */
  allowSleep: true,
} as const;

/** The board (and grid). Walls sit just inside this. Single source of truth. */
export const BOARD = {
  size: 18,
  half: 9,
  /** Walls sit this far inside the edge. */
  wallInset: 0.5,
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
  background: 0x171b21,
  board: 0x424b56,
  grid: 0x5b6671,
  warmWhite: 0xf2ece1,
  teal: 0x4fb6a8,
  coral: 0xe07a5f,
  indigo: 0x5566a8,
  amber: 0xd9a14a,
  slate: 0x7a8794,
} as const;
