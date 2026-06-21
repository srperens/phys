/**
 * Sandbox — glues physics and rendering via entity pairs (body ↔ mesh).
 * Physics owns the truth; every frame the body is mirrored to the mesh.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createWorld, installContactMaterial, createGround, createWalls, stepWorld } from './physics/world';
import { createBody } from './physics/bodyFactory';
import { InstanceManager } from './render/instances';
import { OBJECT_DEFS, OBJECT_LIST, type ObjectDef } from './objects/defs';
import { BOARD } from './config';
import type { RenderContext } from './render/scene';

export interface Entity {
  def: ObjectDef;
  body: CANNON.Body;
}

export class Sandbox {
  readonly world: CANNON.World;
  private readonly render: RenderContext;
  private readonly instances: InstanceManager;
  private readonly entities: Entity[] = [];
  private readonly constraints: CANNON.Constraint[] = [];
  private readonly walls: CANNON.Body[] = createWalls();
  paused = false;
  wallsEnabled = false;

  /** Deterministic pseudo-random → nicely spread spawns, reproducible. */
  private seed = 1;

  constructor(render: RenderContext) {
    this.render = render;
    this.instances = new InstanceManager(render.scene);
    this.world = createWorld();
    installContactMaterial(this.world);
    createGround(this.world);
  }

  get count(): number {
    return this.entities.length;
  }

  /** Instanced meshes that can be raycast against (grip). */
  get pickables(): THREE.Object3D[] {
    return this.instances.pickables;
  }

  /** Resolve a raycast hit (mesh + instanceId) to its body. */
  bodyAt(object: THREE.Object3D, instanceId: number): CANNON.Body | undefined {
    return this.instances.bodyAt(object, instanceId);
  }

  /** All dynamic bodies (for detonate/implode). */
  get dynamicBodies(): CANNON.Body[] {
    return this.entities.map((e) => e.body);
  }

  /** Randomize a little so stacks/piles form on their own. */
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  spawn(defId: string, position?: CANNON.Vec3): Entity | undefined {
    const def = OBJECT_DEFS[defId];
    if (!def) return undefined;

    const body = createBody(def);
    body.position.copy(
      position ??
        new CANNON.Vec3(
          (this.rand() - 0.5) * 5,
          6 + this.rand() * 4,
          (this.rand() - 0.5) * 5,
        ),
    );
    body.quaternion.setFromEuler(
      this.rand() * Math.PI,
      this.rand() * Math.PI,
      this.rand() * Math.PI,
    );
    this.world.addBody(body);
    this.instances.add(def, body);

    const entity: Entity = { def, body };
    this.entities.push(entity);
    return entity;
  }

  /** Default starter scene — a cube plus a few mixed shapes. */
  spawnStarterScene(): void {
    this.spawn('cube');
    this.spawnMany(6);
  }

  /** Scatter n objects (random type if none given) — fill the board. */
  spawnMany(n: number, defId?: string): void {
    for (let i = 0; i < n; i++) {
      const id = defId ?? OBJECT_LIST[Math.floor(this.rand() * OBJECT_LIST.length)].id;
      this.spawn(id);
    }
  }

  /**
   * Torus chain (M5): N tori threaded deeply through each other (alternating hole
   * axis), PLUS a DistanceConstraint between neighbours held at the ring radius.
   *
   * The small spacing (= ring radius) keeps them DEEPLY threaded: to come side-by-side
   * the rings would have to heavily overlap, which collision strongly resists — so they
   * stay genuinely interlocked, not beads-on-a-string. The constraint is the unbreakable
   * backbone so a hard pull can't squeeze one link's tube out through another.
   */
  spawnChain(links = 7): void {
    const def = OBJECT_DEFS.torus;
    if (def.shape.kind !== 'torus') return;
    const spacing = def.shape.radius; // deep threading → clearly interlocked
    const startX = -(links - 1) * spacing * 0.5;
    let prev: CANNON.Body | undefined;

    for (let i = 0; i < links; i++) {
      const entity = this.spawn('torus', new CANNON.Vec3(startX + i * spacing, 7, 0));
      if (!entity) continue;
      // Alternate hole axis (Z / Y) so consecutive links interlock.
      entity.body.quaternion.setFromEuler(i % 2 === 0 ? 0 : Math.PI / 2, 0, 0);

      if (prev) {
        const c = new CANNON.DistanceConstraint(prev, entity.body, spacing, 1e6);
        this.world.addConstraint(c);
        this.constraints.push(c);
      }
      prev = entity.body;
    }
  }

  /** Toggle the invisible boundary walls. */
  setWalls(on: boolean): void {
    if (on === this.wallsEnabled) return;
    this.wallsEnabled = on;
    for (const w of this.walls) {
      if (on) this.world.addBody(w);
      else this.world.removeBody(w);
    }
    this.render.wallGroup.visible = on; // show/hide the translucent panels
    this.wakeAll();
  }

  /** Wake all sleeping bodies — e.g. when gravity/bounce changes or on detonate. */
  wakeAll(): void {
    for (const e of this.entities) {
      e.body.wakeUp();
    }
  }

  clear(): void {
    for (const c of this.constraints) {
      this.world.removeConstraint(c);
    }
    this.constraints.length = 0;
    for (const e of this.entities) {
      this.world.removeBody(e.body);
    }
    this.entities.length = 0;
    this.instances.clear();
  }

  /** Advance the physics and mirror it into the instance matrices. */
  update(dt: number): void {
    if (!this.paused) {
      stepWorld(this.world, dt);
      if (this.wallsEnabled) this.clampToArena();
    }
    this.instances.sync();
  }

  /**
   * Backstop: keep every body inside the arena when walls are on. Wall collisions
   * already handle the normal case; this only catches the rare escapee (a fast
   * detonate tunnelling/clearing a wall, or pile pressure squeezing one through),
   * so nothing ever leaks out — without affecting resting objects.
   */
  private clampToArena(): void {
    const lim = BOARD.half - BOARD.wallInset - 0.05;
    const ceil = BOARD.wallHeight + 4;
    for (const e of this.entities) {
      const p = e.body.position;
      const v = e.body.velocity;
      if (p.x > lim) { p.x = lim; if (v.x > 0) v.x = 0; }
      else if (p.x < -lim) { p.x = -lim; if (v.x < 0) v.x = 0; }
      if (p.z > lim) { p.z = lim; if (v.z > 0) v.z = 0; }
      else if (p.z < -lim) { p.z = -lim; if (v.z < 0) v.z = 0; }
      if (p.y > ceil && v.y > 0) { p.y = ceil; v.y = 0; }
    }
  }
}
