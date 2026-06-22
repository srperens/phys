/**
 * Physics Web Worker. Owns the cannon world and runs it off the main thread, so the
 * render thread stays smooth under heavy physics. Streams body transforms back each
 * step and handles commands (spawn, grab, forces, walls). Reuses the pure physics
 * modules (world/forces/config/defs/prism/gomboc).
 */
import * as CANNON from 'cannon-es';
import {
  createWorld,
  installContactMaterial,
  createGround,
  createWalls,
  stepWorld,
} from './world';
import { detonate, implode } from '../forces/detonate';
import { OBJECT_DEFS, type ObjectDef } from '../objects/defs';
import { STRUCTURES } from '../objects/structures';
import { PRISM_VERTS, PRISM_FACES } from '../objects/prism';
import { GOMBOC } from '../objects/gomboc';
import { FEEL, BOARD } from '../config';
import { STRIDE, type MainToWorker } from './protocol';

let world: CANNON.World;
const bodies: CANNON.Body[] = [];
const constraints: CANNON.Constraint[] = [];
const walls: CANNON.Body[] = [];
let wallsOn = false;
let gen = 0; // structural generation, echoed in frames so main applies only matching ones
let solverIters: number = FEEL.solverIterations; // current (adaptive) solver iteration count

/** Solver iterations for a given body count: full up to a threshold, then ramped down to
 *  a floor for big piles so the physics doesn't run slow-mo when they collapse. */
function solverIterationsFor(n: number): number {
  if (n <= FEEL.solverFullUpTo) return FEEL.solverIterations;
  if (n >= FEEL.solverMinAt) return FEEL.solverIterationsMin;
  const t = (n - FEEL.solverFullUpTo) / (FEEL.solverMinAt - FEEL.solverFullUpTo);
  return Math.round(FEEL.solverIterations + t * (FEEL.solverIterationsMin - FEEL.solverIterations));
}

// Grab state.
let grabbed: CANNON.Body | null = null;
let jointBody: CANNON.Body | null = null;
let constraint: CANNON.PointToPointConstraint | null = null;
let grabSaved = { allowSleep: true, angularDamping: 0.2, linearDamping: 0.15 };

// Freeze: a per-object state, not a global pause — the world keeps stepping, but a frozen
// body is made immovable (mass 0 / STATIC) so it hangs in place yet still collides. Grab
// or strike thaws just that one; unfreezing thaws all. Saved state restores it exactly.
interface FrozenState { mass: number; type: CANNON.Body['type']; vx: number; vy: number; vz: number; ax: number; ay: number; az: number; allowSleep: boolean }
const frozen = new Map<CANNON.Body, FrozenState>();

function freezeBody(b: CANNON.Body): void {
  if (frozen.has(b)) return;
  frozen.set(b, {
    mass: b.mass, type: b.type,
    vx: b.velocity.x, vy: b.velocity.y, vz: b.velocity.z,
    ax: b.angularVelocity.x, ay: b.angularVelocity.y, az: b.angularVelocity.z,
    allowSleep: b.allowSleep,
  });
  b.velocity.setZero();
  b.angularVelocity.setZero();
  b.mass = 0;
  b.type = CANNON.Body.STATIC;
  b.updateMassProperties(); // mass 0 → invMass/invInertia 0 → immovable but still collidable
  b.allowSleep = false;
  b.aabbNeedsUpdate = true;
}

function thawBody(b: CANNON.Body): void {
  const s = frozen.get(b);
  if (!s) return;
  frozen.delete(b);
  b.mass = s.mass;
  b.type = s.type;
  b.updateMassProperties();
  b.velocity.set(s.vx, s.vy, s.vz); // resume exactly as it was before the freeze
  b.angularVelocity.set(s.ax, s.ay, s.az);
  b.allowSleep = s.allowSleep;
  b.aabbNeedsUpdate = true;
  b.wakeUp();
}

function freezeAll(on: boolean): void {
  for (const b of bodies) (on ? freezeBody : thawBody)(b);
}

function makeShape(def: ObjectDef): CANNON.Shape {
  const s = def.shape;
  switch (s.kind) {
    case 'box':
      return new CANNON.Box(new CANNON.Vec3(s.halfExtents[0], s.halfExtents[1], s.halfExtents[2]));
    case 'sphere':
      return new CANNON.Sphere(s.radius);
    case 'cylinder':
      return new CANNON.Cylinder(s.radius, s.radius, s.height, s.segments);
    case 'prism':
      return new CANNON.ConvexPolyhedron({
        vertices: PRISM_VERTS.map(([x, y, z]) => new CANNON.Vec3(x, y, z)),
        faces: PRISM_FACES,
      });
    default:
      throw new Error('compound shape built in createBody');
  }
}

function createBody(def: ObjectDef): CANNON.Body {
  const body = new CANNON.Body({
    mass: def.mass,
    linearDamping: FEEL.linearDamping,
    angularDamping: FEEL.angularDamping,
  });
  body.sleepSpeedLimit = FEEL.sleepSpeedLimit;
  body.sleepTimeLimit = FEEL.sleepTimeLimit;

  const s = def.shape;
  if (s.kind === 'torus') {
    for (let i = 0; i < s.segments; i++) {
      const theta = (i / s.segments) * Math.PI * 2;
      body.addShape(
        new CANNON.Sphere(s.tube),
        new CANNON.Vec3(Math.cos(theta) * s.radius, Math.sin(theta) * s.radius, 0),
      );
    }
  } else if (s.kind === 'gomboc') {
    body.addShape(new CANNON.Sphere(GOMBOC.sphereRadius), new CANNON.Vec3(0, GOMBOC.sphereCenterY, 0));
    body.allowSleep = false;
    body.angularDamping = 0.55;
  } else {
    body.addShape(makeShape(def));
  }
  return body;
}

// Zero-gravity "space" mode: with no gravity, the damping (air-resistance) and sleeping
// that make throws settle would also bleed off all motion → nothing drifts. So near-zero
// gravity disables both, and momentum/spin are conserved (Newton, no friction → forever).
let spaceMode = false;

function setSpaceMode(on: boolean): void {
  if (on === spaceMode) return;
  spaceMode = on;
  world.allowSleep = on ? false : FEEL.allowSleep;
  for (const b of bodies) {
    b.linearDamping = on ? 0 : FEEL.linearDamping;
    b.angularDamping = on ? 0 : FEEL.angularDamping;
  }
}

function spawn(def: ObjectDef, pos: CANNON.Vec3, quat?: CANNON.Quaternion, vel?: [number, number, number]): CANNON.Body {
  const body = createBody(def);
  body.position.copy(pos);
  if (quat) body.quaternion.copy(quat);
  if (vel) body.velocity.set(vel[0], vel[1], vel[2]);
  if (spaceMode) {
    body.linearDamping = 0;
    body.angularDamping = 0;
  }
  world.addBody(body);
  bodies.push(body);
  return body;
}

function spawnChain(): void {
  const def = OBJECT_DEFS.torus;
  if (def.shape.kind !== 'torus') return;
  const spacing = def.shape.radius;
  const startX = -(7 - 1) * spacing * 0.5;
  let prev: CANNON.Body | undefined;
  for (let i = 0; i < 7; i++) {
    const q = new CANNON.Quaternion();
    q.setFromEuler(i % 2 === 0 ? 0 : Math.PI / 2, 0, 0);
    const body = spawn(def, new CANNON.Vec3(startX + i * spacing, 7, 0), q);
    if (prev) {
      const c = new CANNON.DistanceConstraint(prev, body, spacing, 1e6);
      world.addConstraint(c);
      constraints.push(c);
    }
    prev = body;
  }
}

function spawnStructure(name: string, offset: [number, number, number]): void {
  const def = STRUCTURES[name];
  if (!def) return;
  for (const p of def.build()) {
    const objDef = OBJECT_DEFS[p.id];
    if (!objDef) continue;
    const q = p.quat
      ? new CANNON.Quaternion(p.quat[0], p.quat[1], p.quat[2], p.quat[3])
      : undefined;
    const pos = new CANNON.Vec3(p.pos[0] + offset[0], p.pos[1] + offset[1], p.pos[2] + offset[2]);
    spawn(objDef, pos, q);
  }
}

function clearAll(): void {
  for (const c of constraints) world.removeConstraint(c);
  constraints.length = 0;
  for (const b of bodies) world.removeBody(b);
  bodies.length = 0;
  frozen.clear();
  endGrab();
}

function wakeAll(): void {
  for (const b of bodies) b.wakeUp();
}

function setWalls(on: boolean): void {
  if (on === wallsOn) return;
  wallsOn = on;
  for (const w of walls) {
    if (on) world.addBody(w);
    else world.removeBody(w);
  }
  wakeAll();
}

function clampToArena(): void {
  const lim = BOARD.half - BOARD.wallInset - 0.05;
  const ceil = BOARD.wallHeight + 4;
  for (const b of bodies) {
    const p = b.position;
    const v = b.velocity;
    if (p.x > lim) { p.x = lim; if (v.x > 0) v.x = 0; }
    else if (p.x < -lim) { p.x = -lim; if (v.x < 0) v.x = 0; }
    if (p.z > lim) { p.z = lim; if (v.z > 0) v.z = 0; }
    else if (p.z < -lim) { p.z = -lim; if (v.z < 0) v.z = 0; }
    if (p.y > ceil && v.y > 0) { p.y = ceil; v.y = 0; }
  }
}

function grabStart(index: number, point: [number, number, number]): void {
  endGrab();
  const body = bodies[index];
  if (!body) return;
  thawBody(body); // dragging a frozen shape thaws just that one
  grabbed = body;
  grabSaved = {
    allowSleep: body.allowSleep,
    angularDamping: body.angularDamping,
    linearDamping: body.linearDamping,
  };
  body.allowSleep = false;
  body.wakeUp();
  // Wake the rest too: yanking a support out from under a sleeping pile must let it fall.
  wakeAll();
  body.angularDamping = 0.9;
  body.linearDamping = 0.4;

  const worldHit = new CANNON.Vec3(point[0], point[1], point[2]);
  const pivotLocal = new CANNON.Vec3();
  body.pointToLocalFrame(worldHit, pivotLocal);

  jointBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  jointBody.collisionResponse = false;
  jointBody.position.copy(worldHit);
  world.addBody(jointBody);

  constraint = new CANNON.PointToPointConstraint(
    body,
    pivotLocal,
    jointBody,
    new CANNON.Vec3(0, 0, 0),
    FEEL.gripMaxForce,
  );
  world.addConstraint(constraint);
}

function grabMove(point: [number, number, number]): void {
  if (jointBody) jointBody.position.set(point[0], point[1], point[2]);
}

function endGrab(): void {
  if (constraint) world.removeConstraint(constraint);
  if (jointBody) world.removeBody(jointBody);
  if (grabbed) {
    grabbed.allowSleep = grabSaved.allowSleep;
    grabbed.angularDamping = grabSaved.angularDamping;
    grabbed.linearDamping = grabSaved.linearDamping;
  }
  constraint = null;
  jointBody = null;
  grabbed = null;
}

/** Billiard-cue strike: an impulse applied at a world point (off-centre → spin). */
function strike(index: number, impulse: [number, number, number], point: [number, number, number]): void {
  const b = bodies[index];
  if (!b) return;
  thawBody(b); // a struck frozen shape thaws so the impulse can move it
  // Wake the whole board, not just the struck body: pieces resting on it have lost their
  // support and must fall. A sleeping body integrates no gravity, so without this the
  // upper part of a struck tower freezes in mid-air.
  wakeAll();
  // applyImpulse wants the application point as an offset from the centre of mass, world-aligned.
  const rel = new CANNON.Vec3(point[0] - b.position.x, point[1] - b.position.y, point[2] - b.position.z);
  b.applyImpulse(new CANNON.Vec3(impulse[0], impulse[1], impulse[2]), rel);
}

function handle(msg: MainToWorker): void {
  switch (msg.type) {
    case 'init':
      world = createWorld();
      installContactMaterial(world);
      createGround(world);
      walls.push(...createWalls());
      break;
    case 'spawn': {
      gen = msg.gen;
      const def = OBJECT_DEFS[msg.id];
      if (def) {
        const q = new CANNON.Quaternion(msg.quat[0], msg.quat[1], msg.quat[2], msg.quat[3]);
        spawn(def, new CANNON.Vec3(msg.pos[0], msg.pos[1], msg.pos[2]), q, msg.vel);
      }
      break;
    }
    case 'spawnChain': gen = msg.gen; spawnChain(); break;
    case 'structure': gen = msg.gen; spawnStructure(msg.name, msg.offset); break;
    case 'clear': gen = msg.gen; clearAll(); break;
    case 'pause': freezeAll(msg.paused); break;
    case 'gravity':
      world.gravity.set(0, msg.value, 0);
      setSpaceMode(Math.abs(msg.value) < 0.5); // near-zero gravity → conserve momentum
      wakeAll();
      break;
    case 'restitution': world.defaultContactMaterial.restitution = msg.value; wakeAll(); break;
    case 'walls': setWalls(msg.on); break;
    case 'detonate':
      detonate(bodies, new CANNON.Vec3(...msg.center), { strength: msg.strength, spin: msg.spin });
      break;
    case 'implode':
      implode(bodies, new CANNON.Vec3(...msg.center), { strength: msg.strength });
      break;
    case 'stopMotion':
      // Kill linear motion only — spin is left untouched (objects stop in place but
      // keep tumbling). wakeUp so the change applies even to sleeping bodies.
      for (const b of bodies) {
        b.velocity.set(0, 0, 0);
        b.wakeUp();
      }
      break;
    case 'strike': strike(msg.index, msg.impulse, msg.point); break;
    case 'grabStart': grabStart(msg.index, msg.point); break;
    case 'grabMove': grabMove(msg.point); break;
    case 'grabEnd': endGrab(); break;
  }
}

self.onmessage = (e: MessageEvent<MainToWorker>) => handle(e.data);

// --- Physics loop (decoupled from the render thread) ---
let last = performance.now();
function tick(): void {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  if (world) {
    // Adapt solver iterations to the load before stepping.
    const want = solverIterationsFor(bodies.length);
    if (want !== solverIters) {
      solverIters = want;
      (world.solver as CANNON.GSSolver).iterations = want;
    }
    // The world always steps; "freeze" is per-body (frozen bodies are static), so a
    // thawed shape moves and interacts while the frozen ones stay put.
    stepWorld(world, dt);
    if (wallsOn) clampToArena();
    const f = new Float32Array(STRIDE * bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const o = i * STRIDE;
      f[o] = b.position.x; f[o + 1] = b.position.y; f[o + 2] = b.position.z;
      f[o + 3] = b.quaternion.x; f[o + 4] = b.quaternion.y;
      f[o + 5] = b.quaternion.z; f[o + 6] = b.quaternion.w;
    }
    self.postMessage({ type: 'frame', gen, count: bodies.length, buffer: f.buffer }, { transfer: [f.buffer] });
  }
  setTimeout(tick, 1000 / 60);
}
tick();
