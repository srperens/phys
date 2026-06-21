/**
 * Physics layer. Owns the truth about positions. Knows NOTHING about rendering.
 */
import * as CANNON from 'cannon-es';
import { FEEL, SIM } from '../config';

export function createWorld(): CANNON.World {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, FEEL.gravity, 0),
  });

  // Good default solver for stable stacks and (later) chains.
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = FEEL.solverIterations;
  world.allowSleep = FEEL.allowSleep;

  return world;
}

/**
 * One shared contact material for everything → a single place to tune bounce/friction.
 * All bodies use defaultMaterial; we set the default↔default contact.
 */
export function installContactMaterial(world: CANNON.World): void {
  const contact = new CANNON.ContactMaterial(
    world.defaultMaterial,
    world.defaultMaterial,
    {
      restitution: FEEL.restitution,
      friction: FEEL.friction,
    },
  );
  world.addContactMaterial(contact);
  // Make sure the default contact mirrors our knobs too.
  world.defaultContactMaterial.restitution = FEEL.restitution;
  world.defaultContactMaterial.friction = FEEL.friction;
}

/** Static floor (the board). Plane faces up in +Y. */
export function createGround(world: CANNON.World): CANNON.Body {
  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  return ground;
}

/**
 * Four invisible, inward-facing wall planes around the board so shapes can't
 * skid or bounce off the edge. Returned but NOT added to the world — the sandbox
 * toggles them on/off. `boundary` is just inside the visible board (half-size 12).
 */
export function createWalls(boundary = 11.5): CANNON.Body[] {
  const localNormal = new CANNON.Vec3(0, 0, 1); // CANNON.Plane faces +Z
  const specs: Array<{ pos: CANNON.Vec3; normal: CANNON.Vec3 }> = [
    { pos: new CANNON.Vec3(boundary, 0, 0), normal: new CANNON.Vec3(-1, 0, 0) },
    { pos: new CANNON.Vec3(-boundary, 0, 0), normal: new CANNON.Vec3(1, 0, 0) },
    { pos: new CANNON.Vec3(0, 0, boundary), normal: new CANNON.Vec3(0, 0, -1) },
    { pos: new CANNON.Vec3(0, 0, -boundary), normal: new CANNON.Vec3(0, 0, 1) },
  ];
  return specs.map(({ pos, normal }) => {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    body.position.copy(pos);
    body.quaternion.setFromVectors(localNormal, normal);
    return body;
  });
}

/** Fixed timestep with delta clamp → physics stays stable regardless of FPS. */
export function stepWorld(world: CANNON.World, dt: number): void {
  const clamped = Math.min(dt, SIM.maxDelta);
  world.step(SIM.fixedTimeStep, clamped, SIM.maxSubSteps);
}
