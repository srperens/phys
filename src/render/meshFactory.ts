/**
 * ObjectDef → THREE.Mesh. Mirrors the same ShapeDef as bodyFactory.
 * Matte material (matte > glossy) per the aesthetic.
 */
import * as THREE from 'three';
import type { ObjectDef } from '../objects/defs';
import { prismPositions, prismUVs } from '../objects/prism';
import { checkerTexture } from './textures';

export function createMesh(def: ObjectDef): THREE.Mesh {
  const geometry = makeGeometry(def);
  const material = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.7,
    metalness: 0.05,
    // Square grid texture multiplies the color → keeps the hue, adds squares.
    map: checkerTexture(),
    flatShading: def.shape.kind === 'prism',
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
      return new THREE.SphereGeometry(def.shape.radius, 32, 24);
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
      return new THREE.TorusGeometry(def.shape.radius, def.shape.tube, 16, 40);
  }
}
