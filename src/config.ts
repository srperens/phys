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

  /** Throws coast and settle without sticking; a touch of extra angular damping
   *  helps resting piles stop boiling. */
  linearDamping: 0.15,
  angularDamping: 0.2,

  /**
   * Grip strength (M2). Constant, NOT mass-scaled — that is the whole point:
   * the acceleration ceiling F/m is lower for heavy shapes → they lag = feel heavy.
   */
  gripMaxForce: 500,

  /** Solver iterations. More iterations resolve deep-pile overlaps cleanly so the
   *  pile doesn't boil; the chain stays together via link constraints (spawnChain).
   *  This is the MAX, used for normal scenes — see the adaptive knobs below. */
  solverIterations: 30,

  /** Adaptive solver: each iteration costs CPU per contact, so a huge pile (e.g. the
   *  286-cube Pyramid XXXL) at full iterations can run the physics slow-mo. We keep full
   *  iterations up to `solverFullUpTo` bodies, then ramp down to `solverIterationsMin` by
   *  `solverMinAt` bodies — so small scenes stay rigid and big collapses stay smooth. */
  solverIterationsMin: 8,
  solverFullUpTo: 80,
  solverMinAt: 300,

  /** Contact stiffness/relaxation — moderate stiffness with softer relaxation so
   *  overlap correction is gentle (doesn't inject jitter velocity) and stable. */
  contactStiffness: 1e7,
  contactRelaxation: 4,

  /** Resting shapes fall asleep (looks good + saves CPU). Wake on grip/detonate. */
  allowSleep: true,

  /** Sleep tuning — a shape settles to sleep once it's slow for this long, which
   *  freezes out the tiny restitution-driven jitter in resting piles. A fairly high
   *  speed limit makes piles snap to rest (reads as solid/rigid) rather than shiver. */
  sleepSpeedLimit: 0.5,
  sleepTimeLimit: 0.3,
} as const;

/** The board (and grid). Walls sit just inside this. Single source of truth. */
export const BOARD = {
  size: 18,
  half: 9,
  /** Walls sit this far inside the edge. */
  wallInset: 0.5,
  /** Wall height — physics and the visible panel share this, so the wall is solid
   *  exactly as far up as you can see it (no invisible wall above the panel). */
  wallHeight: 8,
} as const;

export const SIM = {
  /** Fixed timestep — physics stays stable regardless of FPS. */
  fixedTimeStep: 1 / 60,
  /** Max catch-up substeps per frame. 2 keeps a heavy scene from spiralling (each
   *  substep is a full collision solve); under load it runs slightly slow-mo instead. */
  maxSubSteps: 2,
  /** Clamp on the frame delta so a lag spike does not blow up the simulation. */
  maxDelta: 0.05,
} as const;

/** Matte, harmonious palette — matte > glossy, keeps the scene "clean". */
export const PALETTE = {
  background: 0x171b21,
  board: 0x424b56,
  /** Ground beyond the board — same blue-grey tone, a few shades darker so the board still reads. */
  boardOuter: 0x2b323b,
  grid: 0x5b6671,
  warmWhite: 0xf2ece1,
  teal: 0x4fb6a8,
  coral: 0xe07a5f,
  indigo: 0x5566a8,
  amber: 0xd9a14a,
  slate: 0x7a8794,
} as const;

/** Patchwork of board-sized tiles surrounding the arena — muted, low-saturation tones
 *  in the same dark family so the world reads as many boards, not one sterile floor.
 *  All darker than PALETTE.board, so the central arena stays the brightest. */
export const GROUND_TONES = [
  0x2b323b, // blue-grey
  0x313a36, // green-grey
  0x3b3640, // violet-grey
  0x3c372e, // warm umber
  0x2f3a40, // steel-blue
  0x383039, // mauve-grey
] as const;
