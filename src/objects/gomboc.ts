/**
 * Gömböc-style self-righting shape. A true gömböc self-rights from its exact
 * homogeneous geometry (not reproducible in a rigid-body engine), so we fake the
 * effect the honest Weeble way: a rounded bottom + a centre of mass well below the
 * contact sphere's centre, which produces a restoring torque from any orientation.
 *
 * The collider is a single sphere offset ABOVE the body origin. In cannon the centre
 * of mass is the body origin, so placing the sphere above it puts the COM low → it
 * always rolls back upright. The mesh is a teardrop (fat rounded bottom, pointed top)
 * so the righting is clearly visible.
 */

export const GOMBOC = {
  /** Contact sphere radius. */
  sphereRadius: 0.6,
  /** Sphere centre above the body origin (= COM). Low COM → self-rights. Kept so the
   *  sphere bottom matches the mesh bottom (no tip poking through the floor). */
  sphereCenterY: 0.42,
};

/**
 * Lathe profile [radius, y] from the bottom point up to the top point, in body-local
 * coords (origin = COM). The bottom bulge envelopes the collider sphere.
 */
export const GOMBOC_PROFILE: [number, number][] = [
  [0.0, -0.18],
  [0.3, -0.04],
  [0.5, 0.16],
  [0.6, 0.42],
  [0.56, 0.64],
  [0.46, 0.92],
  [0.32, 1.2],
  [0.16, 1.44],
  [0.05, 1.6],
  [0.0, 1.64],
];
