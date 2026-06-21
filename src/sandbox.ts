/**
 * Sandbox — orchestrates the physics worker and instanced rendering. Physics runs in
 * the worker (PhysicsClient); the main thread only sends commands and renders from the
 * streamed transforms (applied straight into the instance matrices). Keeps light
 * bookkeeping (object count, wall/pause mirrors) for the UI.
 */
import * as THREE from 'three';
import { InstanceManager } from './render/instances';
import { PhysicsClient } from './physics/physicsClient';
import { OBJECT_DEFS, OBJECT_LIST } from './objects/defs';
import type { RenderContext } from './render/scene';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export class Sandbox {
  private readonly render: RenderContext;
  private readonly instances: InstanceManager;
  private readonly physics: PhysicsClient;
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private _count = 0;
  paused = false;
  wallsEnabled = false;

  /** Structural generation, bumped on every spawn/clear. The worker echoes it in each
   *  frame; we only apply frames whose gen matches, so a late frame never gets mapped
   *  onto a different object set (which caused objects to blip to wrong positions). */
  private gen = 0;

  /** Deterministic pseudo-random → nicely spread spawns, reproducible. */
  private seed = 1;

  constructor(render: RenderContext) {
    this.render = render;
    this.instances = new InstanceManager(render.scene);
    this.physics = new PhysicsClient((frameGen, count, t) => {
      if (frameGen === this.gen) this.instances.applyFrame(count, t);
    });
  }

  get count(): number {
    return this._count;
  }

  /** Instanced meshes that can be raycast against (grip). */
  get pickables(): THREE.Object3D[] {
    return this.instances.pickables;
  }

  /** Resolve a raycast hit (mesh + instanceId) to a worker body index. */
  indexAt(object: THREE.Object3D, instanceId: number): number | undefined {
    return this.instances.indexAt(object, instanceId);
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private randomQuat(): Quat {
    this.tmpEuler.set(this.rand() * Math.PI, this.rand() * Math.PI, this.rand() * Math.PI);
    this.tmpQuat.setFromEuler(this.tmpEuler);
    return [this.tmpQuat.x, this.tmpQuat.y, this.tmpQuat.z, this.tmpQuat.w];
  }

  spawn(defId: string, position?: Vec3): void {
    const def = OBJECT_DEFS[defId];
    if (!def) return;
    const pos: Vec3 = position ?? [
      (this.rand() - 0.5) * 5,
      6 + this.rand() * 4,
      (this.rand() - 0.5) * 5,
    ];
    this.gen += 1;
    this.physics.spawn(this.gen, defId, pos, this.randomQuat());
    this.instances.add(def);
    this._count += 1;
  }

  spawnMany(n: number, defId?: string): void {
    for (let i = 0; i < n; i++) {
      const id = defId ?? OBJECT_LIST[Math.floor(this.rand() * OBJECT_LIST.length)].id;
      this.spawn(id);
    }
  }

  /** Worker builds the linked chain; main just registers the 7 torus instances. */
  spawnChain(): void {
    this.gen += 1;
    this.physics.spawnChain(this.gen);
    for (let i = 0; i < 7; i++) {
      this.instances.add(OBJECT_DEFS.torus);
      this._count += 1;
    }
  }

  spawnStarterScene(): void {
    this.spawn('cube');
    this.spawnMany(6);
  }

  clear(): void {
    this.gen += 1;
    this.physics.clear(this.gen);
    this.instances.clear();
    this._count = 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.physics.pause(paused);
  }

  setGravity(value: number): void {
    this.physics.gravity(value);
  }

  setRestitution(value: number): void {
    this.physics.restitution(value);
  }

  setWalls(on: boolean): void {
    if (on === this.wallsEnabled) return;
    this.wallsEnabled = on;
    this.physics.walls(on);
    this.render.wallGroup.visible = on;
  }

  detonate(center: Vec3, strength: number, spin: number): void {
    this.physics.detonate(center, strength, spin);
  }

  implode(center: Vec3, strength: number): void {
    this.physics.implode(center, strength);
  }

  grabStart(index: number, point: Vec3): void {
    this.physics.grabStart(index, point);
  }

  grabMove(point: Vec3): void {
    this.physics.grabMove(point);
  }

  grabEnd(): void {
    this.physics.grabEnd();
  }
}
