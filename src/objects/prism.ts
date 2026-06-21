/**
 * Triangular prism ("prism") — shared geometry so the collider and the mesh
 * are built from the exact same vertices. Cannon has no prism shape, so we use
 * a ConvexPolyhedron. The winding below is flipped so the face normals point
 * outward under cannon's normal convention.
 */

const W = 0.6; // half base width
const DZ = 0.6; // half depth
const YB = -0.5; // base y
const YT = 0.5; // top y (ridge)

/** 6 vertices: base left/right + ridge top, front (+z) and back (-z). */
export const PRISM_VERTS: [number, number, number][] = [
  [-W, YB, -DZ], // 0
  [W, YB, -DZ], // 1
  [0, YT, -DZ], // 2
  [-W, YB, DZ], // 3
  [W, YB, DZ], // 4
  [0, YT, DZ], // 5
];

/**
 * Faces. The winding is flipped so cannon (whose computeNormal runs opposite
 * to my hand-computed right-hand winding) gets outward normals — otherwise
 * ConvexPolyhedron complains and the mesh renders dark from inward normals.
 */
export const PRISM_FACES: number[][] = [
  [2, 1, 0], // cap -Z
  [3, 4, 5], // cap +Z
  [1, 4, 3, 0], // bottom -Y
  [3, 5, 2, 0], // left slope -X
  [2, 5, 4, 1], // right slope +X
];

/** Triangles for three (non-indexed → flat shading), same winding as above. */
const PRISM_TRIS: number[][] = [
  [2, 1, 0],
  [3, 4, 5],
  [4, 3, 0],
  [1, 4, 0],
  [5, 2, 0],
  [3, 5, 0],
  [5, 4, 1],
  [2, 5, 1],
];

/** Flat position array (non-indexed) for THREE.BufferGeometry. */
export function prismPositions(): Float32Array {
  const out: number[] = [];
  for (const tri of PRISM_TRIS) {
    for (const idx of tri) {
      out.push(...PRISM_VERTS[idx]);
    }
  }
  return new Float32Array(out);
}
