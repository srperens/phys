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

/** Fixed timestep with delta clamp → physics stays stable regardless of FPS. */
export function stepWorld(world: CANNON.World, dt: number): void {
  const clamped = Math.min(dt, SIM.maxDelta);
  world.step(SIM.fixedTimeStep, clamped, SIM.maxSubSteps);
}
