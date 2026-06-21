/**
 * Sandbox — glues physics and rendering via entity pairs (body ↔ mesh).
 * Physics owns the truth; every frame the body is mirrored to the mesh.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createWorld, installContactMaterial, createGround, stepWorld } from './physics/world';
import { createBody } from './physics/bodyFactory';
import { createMesh } from './render/meshFactory';
import { OBJECT_DEFS, OBJECT_LIST, type ObjectDef } from './objects/defs';
import type { RenderContext } from './render/scene';

export interface Entity {
  def: ObjectDef;
  body: CANNON.Body;
  mesh: THREE.Mesh;
}

export class Sandbox {
  readonly world: CANNON.World;
  private readonly render: RenderContext;
  private readonly entities: Entity[] = [];
  private readonly constraints: CANNON.Constraint[] = [];
  paused = false;

  /** Deterministic pseudo-random → nicely spread spawns, reproducible. */
  private seed = 1;

  constructor(render: RenderContext) {
    this.render = render;
    this.world = createWorld();
    installContactMaterial(this.world);
    createGround(this.world);
  }

  get count(): number {
    return this.entities.length;
  }

  /** Meshes that can be raycast against (grip). */
  get pickables(): THREE.Object3D[] {
    return this.entities.map((e) => e.mesh);
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

    const mesh = createMesh(def);
    // Fast lookup on raycast: mesh → body.
    mesh.userData.body = body;
    this.render.scene.add(mesh);

    const entity: Entity = { def, body, mesh };
    this.entities.push(entity);
    return entity;
  }

  /** Scatter n objects (random type if none given) — fill the board. */
  spawnMany(n: number, defId?: string): void {
    for (let i = 0; i < n; i++) {
      const id = defId ?? OBJECT_LIST[Math.floor(this.rand() * OBJECT_LIST.length)].id;
      this.spawn(id);
    }
  }

  /**
   * Torus chain (M5): N tori threaded through each other, linked with DistanceConstraints.
   * Every other link is rotated 90° so the holes alternate → they interlock like real links.
   */
  spawnChain(links = 7): void {
    const def = OBJECT_DEFS.torus;
    if (def.shape.kind !== 'torus') return;
    const spacing = def.shape.radius; // < diameter → neighbors overlap into each other's holes
    const startX = -(links - 1) * spacing * 0.5;
    let prev: CANNON.Body | undefined;

    for (let i = 0; i < links; i++) {
      const entity = this.spawn('torus', new CANNON.Vec3(startX + i * spacing, 7, 0));
      if (!entity) continue;
      // Alternate hole axis (Z / Y) so the links interlock.
      entity.body.quaternion.setFromEuler(i % 2 === 0 ? 0 : Math.PI / 2, 0, 0);

      if (prev) {
        const c = new CANNON.DistanceConstraint(prev, entity.body, spacing, 1e6);
        this.world.addConstraint(c);
        this.constraints.push(c);
      }
      prev = entity.body;
    }
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
      this.render.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.entities.length = 0;
  }

  /** Advance the physics and mirror it to the meshes. */
  update(dt: number): void {
    if (!this.paused) {
      stepWorld(this.world, dt);
    }
    for (const e of this.entities) {
      e.mesh.position.copy(e.body.position as unknown as THREE.Vector3);
      e.mesh.quaternion.copy(e.body.quaternion as unknown as THREE.Quaternion);
    }
  }
}
