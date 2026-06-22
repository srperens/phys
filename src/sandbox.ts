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
import { STRUCTURES, type Placement } from './objects/structures';
import { STRIDE } from './physics/protocol';
import { BOARD } from './config';
import type { RenderContext } from './render/scene';

/** Re-triggering the same structure within this window stacks it on the previous one. */
const STACK_MS = 2000;

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

  /** Latest generation-matched transform frame, kept so game modes can read live
   *  body positions (e.g. to detect a knocked-down piece). */
  private latest: Float32Array | null = null;
  private latestCount = 0;

  /** Last structure spawn, for stack-on-top when the same one is re-triggered quickly. */
  private lastStructure: { name: string; x: number; z: number; baseY: number; time: number } | null = null;

  constructor(render: RenderContext) {
    this.render = render;
    this.instances = new InstanceManager(render.scene);
    this.physics = new PhysicsClient((frameGen, count, t) => {
      if (frameGen === this.gen) {
        this.instances.applyFrame(count, t);
        this.latest = t;
        this.latestCount = count;
      }
    });
  }

  /** World position of a body by its flat index, from the latest frame (null if none). */
  bodyPosition(index: number): [number, number, number] | null {
    if (!this.latest || index < 0 || index >= this.latestCount) return null;
    const o = index * STRIDE;
    return [this.latest[o], this.latest[o + 1], this.latest[o + 2]];
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

  /** Slingshot: spawn a ball at `pos` already moving at `velocity` (a launched projectile). */
  launchBall(pos: Vec3, velocity: Vec3): void {
    const def = OBJECT_DEFS.ball;
    if (!def) return;
    this.gen += 1;
    this.physics.spawn(this.gen, 'ball', pos, [0, 0, 0, 1], velocity);
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

  /**
   * Worker builds the structure; main registers an instance per placement (same order).
   * Placed on a clear spot so it doesn't blast into existing objects — but re-triggering
   * the same structure within STACK_MS stacks it on top of the previous one (tower on
   * tower on tower), so you control the height.
   */
  spawnStructure(name: string): void {
    const def = STRUCTURES[name];
    if (!def) return;
    const placements = def.build();
    const height = structureHeight(placements);

    const now = performance.now();
    const last = this.lastStructure;
    let ox: number;
    let oz: number;
    let oy: number;
    if (last && last.name === name && now - last.time < STACK_MS) {
      ox = last.x;
      oz = last.z;
      oy = last.baseY + height; // stack on top of the previous one
    } else {
      [ox, oz] = this.findClearSpot(footprintRadius(placements));
      oy = 0;
    }
    this.lastStructure = { name, x: ox, z: oz, baseY: oy, time: now };

    this.gen += 1;
    this.physics.structure(this.gen, name, [ox, oy, oz]);
    for (const p of placements) {
      const objDef = OBJECT_DEFS[p.id];
      if (!objDef) continue;
      this.instances.add(objDef);
      this._count += 1;
    }
  }

  /** Find an (x,z) on the board where a structure of the given footprint won't touch any
   *  existing object: try the centre, then rings spiralling outward. */
  private findClearSpot(footprint: number): [number, number] {
    const need = footprint + 0.6; // keep a little breathing room
    const lim = Math.max(0, BOARD.half - BOARD.wallInset - footprint);
    const candidates: Array<[number, number]> = [[0, 0]];
    for (let r = 2; r <= lim; r += 1.5) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + r; // rotate each ring so spots don't line up
        candidates.push([Math.cos(ang) * r, Math.sin(ang) * r]);
      }
    }
    for (const [cx, cz] of candidates) {
      if (Math.abs(cx) > lim || Math.abs(cz) > lim) continue;
      let clear = true;
      for (let i = 0; i < this._count; i++) {
        const p = this.bodyPosition(i);
        if (!p) continue;
        const dx = p[0] - cx;
        const dz = p[2] - cz;
        if (dx * dx + dz * dz < need * need) {
          clear = false;
          break;
        }
      }
      if (clear) return [cx, cz];
    }
    // Board is packed — fall back to the centre.
    return [0, 0];
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
    this.latest = null;
    this.latestCount = 0;
    this.lastStructure = null; // a cleared board never stacks onto a previous structure
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

  /** Stop all linear motion (objects halt in place) but keep their spin. */
  stopMotion(): void {
    this.physics.stopMotion();
  }

  strike(index: number, impulse: Vec3, point: Vec3): void {
    this.physics.strike(index, impulse, point);
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

/** Top surface y of a single placed piece (its centre + vertical half-extent, rotated). */
function placementTopY(p: Placement): number {
  const def = OBJECT_DEFS[p.id];
  if (!def) return p.pos[1] + 0.5;
  const s = def.shape;
  let halfY = 0.5;
  if (s.kind === 'box') {
    const [hx, hy, hz] = s.halfExtents;
    if (p.quat) {
      // Vertical half-extent of the rotated box = |row-1 of R| · half-extents.
      const [x, y, z, w] = p.quat;
      halfY = Math.abs(2 * (x * y + z * w)) * hx + Math.abs(1 - 2 * (x * x + z * z)) * hy + Math.abs(2 * (y * z - x * w)) * hz;
    } else {
      halfY = hy;
    }
  } else if (s.kind === 'cylinder') {
    halfY = s.height / 2; // structures only use upright cylinders
  } else if (s.kind === 'sphere') {
    halfY = s.radius;
  }
  return p.pos[1] + halfY;
}

/** Vertical extent of a structure — the base offset for stacking the next one on top. */
function structureHeight(placements: Placement[]): number {
  let top = 0;
  for (const p of placements) top = Math.max(top, placementTopY(p));
  return top;
}

/** Radius of a structure's footprint in the X/Z plane (for clear-spot placement). */
function footprintRadius(placements: Placement[]): number {
  let maxR = 0;
  for (const p of placements) maxR = Math.max(maxR, Math.hypot(p.pos[0], p.pos[2]));
  return maxR + 0.7; // + roughly a piece half-extent
}
