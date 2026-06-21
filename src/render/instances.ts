/**
 * Instanced rendering. One THREE.InstancedMesh per shape type (all instances of a
 * type share geometry + material + colour), so hundreds of objects cost a handful of
 * draw calls instead of one each. Bodies are appended per type; every frame their
 * transforms are written into the instance matrices.
 */
import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ObjectDef } from '../objects/defs';
import { buildGeometry, buildMaterial } from './meshFactory';

/** Starting capacity per type; grows (doubles) if a type exceeds it. */
const INITIAL_CAPACITY = 256;

interface TypeGroup {
  def: ObjectDef;
  mesh: THREE.InstancedMesh;
  bodies: CANNON.Body[];
}

export class InstanceManager {
  private readonly scene: THREE.Scene;
  private readonly groups = new Map<string, TypeGroup>();

  // Reused scratch objects for matrix composition.
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** InstancedMeshes for raycasting. */
  get pickables(): THREE.Object3D[] {
    return [...this.groups.values()].map((g) => g.mesh);
  }

  private makeMesh(def: ObjectDef, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(buildGeometry(def), buildMaterial(def), capacity);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instances are spread across the board; the default bounding sphere would
    // cull them wrongly, so skip frustum culling.
    mesh.frustumCulled = false;
    // Large fixed bounding sphere: instances move every frame, so a cached/computed
    // sphere would go stale and make the raycast early-out wrongly reject hits.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  private group(def: ObjectDef): TypeGroup {
    let g = this.groups.get(def.id);
    if (!g) {
      g = { def, mesh: this.makeMesh(def, INITIAL_CAPACITY), bodies: [] };
      // Lets the picker resolve an instanceId back to its body.
      g.mesh.userData.group = g;
      this.scene.add(g.mesh);
      this.groups.set(def.id, g);
    }
    return g;
  }

  /** Double a type's capacity, preserving existing instances. */
  private grow(g: TypeGroup): void {
    const bigger = this.makeMesh(g.def, g.mesh.count * 2);
    this.scene.remove(g.mesh);
    g.mesh.dispose();
    bigger.userData.group = g;
    this.scene.add(bigger);
    g.mesh = bigger;
  }

  add(def: ObjectDef, body: CANNON.Body): void {
    const g = this.group(def);
    if (g.bodies.length >= g.mesh.instanceMatrix.count) this.grow(g);
    g.bodies.push(body);
    g.mesh.count = g.bodies.length;
  }

  /** Resolve a raycast hit (instanced mesh + instanceId) back to its body. */
  bodyAt(object: THREE.Object3D, instanceId: number): CANNON.Body | undefined {
    const g = object.userData.group as TypeGroup | undefined;
    return g?.bodies[instanceId];
  }

  clear(): void {
    for (const g of this.groups.values()) {
      g.bodies.length = 0;
      g.mesh.count = 0;
    }
  }

  /** Write every body's transform into its instance matrix. */
  sync(): void {
    for (const g of this.groups.values()) {
      const { mesh, bodies } = g;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        this.p.set(b.position.x, b.position.y, b.position.z);
        this.q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        this.m.compose(this.p, this.q, this.s);
        mesh.setMatrixAt(i, this.m);
      }
      if (bodies.length > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
