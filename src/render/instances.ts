/**
 * Instanced rendering, driven by the worker's transform stream (no main-thread
 * bodies). One THREE.InstancedMesh per shape type, so hundreds of objects cost a
 * handful of draw calls. Owns the mapping between a flat spawn index (the worker's
 * body order) and a (type, instance slot), used both to write transforms and to
 * resolve a raycast hit back to a worker body index.
 */
import * as THREE from 'three';
import type { ObjectDef } from '../objects/defs';
import { STRIDE } from '../physics/protocol';
import { buildGeometry, buildMaterial } from './meshFactory';

const INITIAL_CAPACITY = 256;

interface TypeGroup {
  def: ObjectDef;
  mesh: THREE.InstancedMesh;
  count: number;
  /** flatIndices[slot] = the worker's flat body index for that instance. */
  flatIndices: number[];
}

export class InstanceManager {
  private readonly scene: THREE.Scene;
  private readonly groups = new Map<string, TypeGroup>();
  /** order[flatIndex] = which group + slot that body draws into. */
  private readonly order: Array<{ group: TypeGroup; slot: number }> = [];

  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get pickables(): THREE.Object3D[] {
    return [...this.groups.values()].map((g) => g.mesh);
  }

  private makeMesh(def: ObjectDef, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(buildGeometry(def), buildMaterial(def), capacity);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // Large fixed bounding sphere: instances move every frame, so a computed sphere
    // would go stale and make the raycast early-out wrongly reject hits.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  private group(def: ObjectDef): TypeGroup {
    let g = this.groups.get(def.id);
    if (!g) {
      g = { def, mesh: this.makeMesh(def, INITIAL_CAPACITY), count: 0, flatIndices: [] };
      g.mesh.userData.group = g;
      this.scene.add(g.mesh);
      this.groups.set(def.id, g);
    }
    return g;
  }

  private grow(g: TypeGroup): void {
    const bigger = this.makeMesh(g.def, g.mesh.instanceMatrix.count * 2);
    bigger.count = g.count;
    bigger.userData.group = g;
    this.scene.remove(g.mesh);
    g.mesh.dispose();
    this.scene.add(bigger);
    g.mesh = bigger;
  }

  /** Register a new body (flat index = current order length). */
  add(def: ObjectDef): void {
    const g = this.group(def);
    if (g.count >= g.mesh.instanceMatrix.count) this.grow(g);
    const slot = g.count;
    g.flatIndices[slot] = this.order.length;
    g.count += 1;
    g.mesh.count = g.count;
    this.order.push({ group: g, slot });
  }

  clear(): void {
    this.order.length = 0;
    for (const g of this.groups.values()) {
      g.count = 0;
      g.mesh.count = 0;
      g.flatIndices.length = 0;
    }
  }

  /** Resolve a raycast hit (instanced mesh + instanceId) to a worker body index. */
  indexAt(object: THREE.Object3D, instanceId: number): number | undefined {
    const g = object.userData.group as TypeGroup | undefined;
    return g?.flatIndices[instanceId];
  }

  /** Write the worker's transform frame into the instance matrices. */
  applyFrame(count: number, t: Float32Array): void {
    const n = Math.min(count, this.order.length);
    const touched = new Set<TypeGroup>();
    for (let i = 0; i < n; i++) {
      const { group, slot } = this.order[i];
      const o = i * STRIDE;
      this.p.set(t[o], t[o + 1], t[o + 2]);
      this.q.set(t[o + 3], t[o + 4], t[o + 5], t[o + 6]);
      this.m.compose(this.p, this.q, this.s);
      group.mesh.setMatrixAt(slot, this.m);
      touched.add(group);
    }
    for (const g of touched) g.mesh.instanceMatrix.needsUpdate = true;
  }
}
