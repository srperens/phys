/**
 * ObjectDef → THREE.Mesh. Mirrors the same ShapeDef as bodyFactory.
 * Matte material (matte > glossy) per the aesthetic.
 */
import * as THREE from 'three';
import type { ObjectDef } from '../objects/defs';
import { prismPositions, prismUVs } from '../objects/prism';
import { GOMBOC_PROFILE } from '../objects/gomboc';
import { checkerTexture } from './textures';

export function createMesh(def: ObjectDef): THREE.Mesh {
  const geometry = makeGeometry(def);
  const material = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.7,
    metalness: 0.05,
    // Square grid texture multiplies the color → keeps the hue, adds squares.
    map: checkerTexture(),
    flatShading: def.shape.kind === 'prism' || def.shape.kind === 'dodeca',
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeGeometry(def: ObjectDef): THREE.BufferGeometry {
  switch (def.shape.kind) {
    case 'box': {
      const [x, y, z] = def.shape.halfExtents;
      return new THREE.BoxGeometry(x * 2, y * 2, z * 2);
    }
    case 'sphere':
      return new THREE.SphereGeometry(def.shape.radius, 24, 16);
    case 'cylinder': {
      const { radius, height, segments } = def.shape;
      return new THREE.CylinderGeometry(radius, radius, height, segments);
    }
    case 'prism': {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(prismPositions(), 3));
      geom.setAttribute('uv', new THREE.BufferAttribute(prismUVs(), 2));
      geom.computeVertexNormals();
      return geom;
    }
    case 'torus':
      // Lies in the XY plane, same as the sphere-ring collider.
      return new THREE.TorusGeometry(def.shape.radius, def.shape.tube, 14, 28);
    case 'dodeca':
      // Same circumradius as the convex-hull collider (built from a unit dodeca).
      return new THREE.DodecahedronGeometry(def.shape.radius);
    case 'gomboc': {
      // Start from a teardrop of revolution, then sculpt it asymmetric so it reads as
      // a gömböc, not a plain egg: bend the upper part into a leaning crest and give
      // the cross-section a slight ridge. The rounded belly (which the collider sphere
      // matches) is left untouched so resting/righting is unaffected.
      const points = GOMBOC_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
      const geom = new THREE.LatheGeometry(points, 48);
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.max(0, y - 0.3); // only above the belly
        pos.setX(i, pos.getX(i) + 0.42 * t * t); // lean the crest over to +X
        pos.setZ(i, pos.getZ(i) * (0.82 - 0.12 * t)); // ridge: flatten, sharper toward top
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    }
  }
}
