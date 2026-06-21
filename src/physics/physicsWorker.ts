/**
 * Physics Web Worker. Owns the cannon world and runs it off the main thread, so the
 * render thread stays smooth under heavy physics. Streams body transforms back each
 * step and handles commands (spawn, grab, forces, walls). Reuses the pure physics
 * modules (world/forces/config/defs/prism/gomboc); the dodecahedron hull data (which
 * is three-dependent on the main side) arrives in the `init` message.
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
import { PRISM_VERTS, PRISM_FACES } from '../objects/prism';
import { GOMBOC } from '../objects/gomboc';
import { FEEL, BOARD } from '../config';
import { STRIDE, type MainToWorker } from './protocol';

let world: CANNON.World;
const bodies: CANNON.Body[] = [];
const constraints: CANNON.Constraint[] = [];
const walls: CANNON.Body[] = [];
let wallsOn = false;
let paused = false;
// Dodecahedron hull (from the main thread's three-based computation).
let dodecaVerts: number[][] = [];
let dodecaFaces: number[][] = [];

// Grab state.
let grabbed: CANNON.Body | null = null;
let jointBody: CANNON.Body | null = null;
let constraint: CANNON.PointToPointConstraint | null = null;
let grabSaved = { allowSleep: true, angularDamping: 0.2, linearDamping: 0.15 };

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
    case 'dodeca': {
      const r = s.radius;
      return new CANNON.ConvexPolyhedron({
        vertices: dodecaVerts.map(([x, y, z]) => new CANNON.Vec3(x * r, y * r, z * r)),
        faces: dodecaFaces,
      });
    }
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

function spawn(def: ObjectDef, pos: CANNON.Vec3, quat?: CANNON.Quaternion): CANNON.Body {
  const body = createBody(def);
  body.position.copy(pos);
  if (quat) body.quaternion.copy(quat);
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

function clearAll(): void {
  for (const c of constraints) world.removeConstraint(c);
  constraints.length = 0;
  for (const b of bodies) world.removeBody(b);
  bodies.length = 0;
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
  grabbed = body;
  grabSaved = {
    allowSleep: body.allowSleep,
    angularDamping: body.angularDamping,
    linearDamping: body.linearDamping,
  };
  body.allowSleep = false;
  body.wakeUp();
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

function handle(msg: MainToWorker): void {
  switch (msg.type) {
    case 'init':
      dodecaVerts = msg.dodecaVerts;
      dodecaFaces = msg.dodecaFaces;
      world = createWorld();
      installContactMaterial(world);
      createGround(world);
      walls.push(...createWalls());
      break;
    case 'spawn': {
      const def = OBJECT_DEFS[msg.id];
      if (def) {
        const q = new CANNON.Quaternion(msg.quat[0], msg.quat[1], msg.quat[2], msg.quat[3]);
        spawn(def, new CANNON.Vec3(msg.pos[0], msg.pos[1], msg.pos[2]), q);
      }
      break;
    }
    case 'spawnChain': spawnChain(); break;
    case 'clear': clearAll(); break;
    case 'pause': paused = msg.paused; break;
    case 'gravity': world.gravity.set(0, msg.value, 0); wakeAll(); break;
    case 'restitution': world.defaultContactMaterial.restitution = msg.value; wakeAll(); break;
    case 'walls': setWalls(msg.on); break;
    case 'detonate':
      detonate(bodies, new CANNON.Vec3(...msg.center), { strength: msg.strength, spin: msg.spin });
      break;
    case 'implode':
      implode(bodies, new CANNON.Vec3(...msg.center), { strength: msg.strength });
      break;
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
    if (!paused) {
      stepWorld(world, dt);
      if (wallsOn) clampToArena();
    }
    const f = new Float32Array(STRIDE * bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const o = i * STRIDE;
      f[o] = b.position.x; f[o + 1] = b.position.y; f[o + 2] = b.position.z;
      f[o + 3] = b.quaternion.x; f[o + 4] = b.quaternion.y;
      f[o + 5] = b.quaternion.z; f[o + 6] = b.quaternion.w;
    }
    self.postMessage({ type: 'frame', count: bodies.length, buffer: f.buffer }, { transfer: [f.buffer] });
  }
  setTimeout(tick, 1000 / 60);
}
tick();
