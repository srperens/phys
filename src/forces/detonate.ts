/**
 * Energy release. The showpiece: everything blows apart, flies, and collides.
 */
import * as CANNON from 'cannon-es';

export interface BlastOptions {
  /** Base impulse magnitude (pre mass-division). */
  strength: number;
  /** Extra upward push so things lift off the board rather than skid. */
  upwardBias: number;
  /** Random tumble (max angular velocity per axis). */
  spin: number;
}

const DEFAULTS: BlastOptions = { strength: 26, upwardBias: 0.55, spin: 14 };

/**
 * Push every dynamic body away from `center`.
 * Closer bodies get hit harder; the impulse is applied as a velocity change
 * divided by mass (Δv = J/m) so light shapes fly faster than heavy ones —
 * that is how a real explosion feels.
 */
export function detonate(bodies: CANNON.Body[], center: CANNON.Vec3, opts?: Partial<BlastOptions>): void {
  const o = { ...DEFAULTS, ...opts };
  applyBlast(bodies, center, o, +1);
}

/** Implode — same machinery, pulling inward. */
export function implode(bodies: CANNON.Body[], center: CANNON.Vec3, opts?: Partial<BlastOptions>): void {
  const o = { ...DEFAULTS, ...opts, upwardBias: 0, spin: opts?.spin ?? 6 };
  applyBlast(bodies, center, o, -1);
}

function applyBlast(bodies: CANNON.Body[], center: CANNON.Vec3, o: BlastOptions, sign: number): void {
  const dir = new CANNON.Vec3();
  for (const body of bodies) {
    if (body.mass <= 0) continue;

    body.position.vsub(center, dir);
    let dist = dir.length();
    if (dist < 1e-3) {
      dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      dist = dir.length();
    }
    dir.scale(1 / dist, dir); // normalize

    if (sign > 0) {
      dir.y += o.upwardBias;
      dir.normalize();
    }

    // Closer to the center → harder hit.
    const closeness = 1 / (1 + dist * 0.6);
    const j = o.strength * (0.35 + 0.65 * closeness);
    const dv = (sign * j) / body.mass;

    body.wakeUp();
    body.velocity.x += dir.x * dv;
    body.velocity.y += dir.y * dv;
    body.velocity.z += dir.z * dv;

    body.angularVelocity.set(
      (Math.random() - 0.5) * o.spin,
      (Math.random() - 0.5) * o.spin,
      (Math.random() - 0.5) * o.spin,
    );
  }
}
