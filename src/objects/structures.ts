/**
 * Prebuilt structures — ready-made stacks you can drop onto the board and then
 * knock down by throwing shapes at them. Pure data (no three, no cannon), so both
 * sides share the same recipe: the worker builds the bodies and the main thread
 * registers the matching instances in the same order — exactly like spawnChain.
 *
 * A structure is just a list of placements (object id + resting pose). They sit on
 * the ground at rest, centred on the origin, so they're solid until something hits them.
 */

export interface Placement {
  /** ObjectDef id (see objects/defs.ts). */
  id: string;
  pos: [number, number, number];
  /** Resting orientation; identity if omitted. */
  quat?: [number, number, number, number];
}

export interface StructureDef {
  id: string;
  label: string;
  build(): Placement[];
}

/**
 * Carnival can-pyramid of upright cylinders (rows of 4, 3, 2, 1). Cylinders stand on
 * end — touching side by side they sit still, where lying ones would just roll apart —
 * and each upper can bridges two below, centred in the gap and raised one can-height.
 */
function cylinderPyramid(): Placement[] {
  const out: Placement[] = [];
  const radius = 0.45;
  const diameter = radius * 2; // side-by-side spacing → cans just touch
  const height = 1.0; // cylinder height = vertical step between rows
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const count = rows - row;
    const y = height / 2 + row * height;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * diameter;
      out.push({ id: 'cylinder', pos: [x, y, 0] }); // upright (identity rotation)
    }
  }
  return out;
}

/** Running-bond brick wall of cubes — alternate rows shifted half a brick. */
function brickWall(): Placement[] {
  const out: Placement[] = [];
  const size = 1.0; // cube edge
  const cols = 5;
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? size / 2 : 0;
    const y = size / 2 + row * size;
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * size + shift;
      out.push({ id: 'cube', pos: [x, y, 0] });
    }
  }
  return out;
}

/** A 2×2-footprint column of cubes, four levels tall — a tower to topple. */
function cubeTower(): Placement[] {
  const out: Placement[] = [];
  const size = 1.0;
  const half = size / 2;
  const levels = 4;
  const footprint: [number, number][] = [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ];
  for (let lvl = 0; lvl < levels; lvl++) {
    const y = half + lvl * size;
    for (const [ox, oz] of footprint) out.push({ id: 'cube', pos: [ox, y, oz] });
  }
  return out;
}

/**
 * Jenga tower — levels of three planks, each level turned 90° from the one below, so
 * the three planks of one level sit across the three of the next. Tall and topple-prone.
 * Re-trigger within the stack window to pile a second tower on the first.
 */
function jengaTower(): Placement[] {
  const out: Placement[] = [];
  const levelH = 0.26; // plank thickness = the height step between levels
  const spacing = 0.4; // plank width → three across spans 1.2, a square footprint
  const levels = 6;
  const turn: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° about Y
  for (let lvl = 0; lvl < levels; lvl++) {
    const y = levelH / 2 + lvl * levelH;
    const alongX = lvl % 2 === 0; // alternate orientation each level
    for (let i = -1; i <= 1; i++) {
      if (alongX) out.push({ id: 'block', pos: [0, y, i * spacing] });
      else out.push({ id: 'block', pos: [i * spacing, y, 0], quat: turn });
    }
  }
  return out;
}

/**
 * Stepped pyramid of cubes — a solid square base that shrinks by one cube on each side
 * per level (e.g. 7×7 → 5×5 → 3×3 → 1). A big, satisfying pile to topple; pass a larger
 * (odd) base for a taller, wider pyramid.
 */
function cubePyramid(base: number): () => Placement[] {
  return () => {
    const out: Placement[] = [];
    const size = 1.0;
    for (let level = 0; base - 2 * level >= 1; level++) {
      const n = base - 2 * level;
      const y = size / 2 + level * size;
      const span = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          out.push({ id: 'cube', pos: [(i - span) * size, y, (j - span) * size] });
        }
      }
    }
    return out;
  };
}

export const STRUCTURES: Record<string, StructureDef> = {
  pyramid: { id: 'pyramid', label: 'Cans', build: cylinderPyramid },
  cubepyramid: { id: 'cubepyramid', label: 'Pyramid', build: cubePyramid(7) },
  cubepyramidxxxl: { id: 'cubepyramidxxxl', label: 'Big Pyramid', build: cubePyramid(11) },
  wall: { id: 'wall', label: 'Wall', build: brickWall },
  tower: { id: 'tower', label: 'Tower', build: cubeTower },
  jenga: { id: 'jenga', label: 'Jenga', build: jengaTower },
};

export const STRUCTURE_LIST: StructureDef[] = Object.values(STRUCTURES);
