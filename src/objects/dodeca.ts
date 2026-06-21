/**
 * Dodecahedron collider data. Cannon has no dodecahedron, so we build a
 * ConvexPolyhedron. The hull is computed once from a unit DodecahedronGeometry's
 * vertices (so the collider matches THREE.DodecahedronGeometry exactly). The hull's
 * CCW-from-outside winding already matches cannon's outward-normal convention.
 */
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

function buildUnitDodeca(): { verts: number[][]; faces: number[][] } {
  const geo = new THREE.DodecahedronGeometry(1);
  const pos = geo.getAttribute('position');
  const key = (x: number, y: number, z: number) =>
    `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

  // Unique vertices.
  const points: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = key(x, y, z);
    if (!seen.has(k)) {
      seen.add(k);
      points.push(new THREE.Vector3(x, y, z));
    }
  }
  geo.dispose();

  // Convex hull → triangular faces with outward (CCW-from-outside) normals.
  const hull = new ConvexHull().setFromPoints(points);
  const verts: number[][] = [];
  const vmap = new Map<string, number>();
  const indexOf = (p: THREE.Vector3) => {
    const k = key(p.x, p.y, p.z);
    let i = vmap.get(k);
    if (i === undefined) {
      i = verts.length;
      vmap.set(k, i);
      verts.push([p.x, p.y, p.z]);
    }
    return i;
  };

  const faces: number[][] = [];
  for (const face of hull.faces) {
    const f: number[] = [];
    let edge = face.edge;
    do {
      f.push(indexOf(edge.head().point));
      edge = edge.next;
    } while (edge !== face.edge);
    // three's ConvexHull already winds faces CCW from outside, which is what cannon
    // wants here — keep the order (no reverse).
    faces.push(f);
  }
  return { verts, faces };
}

const UNIT = buildUnitDodeca();

/** Unit-radius vertices [x,y,z][]. */
export const DODECA_VERTS = UNIT.verts;
/** Faces as vertex-index lists, wound for cannon's outward normals. */
export const DODECA_FACES = UNIT.faces;
