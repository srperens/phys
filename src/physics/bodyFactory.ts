/**
 * ObjectDef → CANNON.Body. Translates pure geometry data into a physics body.
 */
import * as CANNON from 'cannon-es';
import type { ObjectDef } from '../objects/defs';
import { PRISM_VERTS, PRISM_FACES } from '../objects/prism';
import { FEEL } from '../config';

export function createBody(def: ObjectDef): CANNON.Body {
  const body = new CANNON.Body({
    mass: def.mass,
    linearDamping: FEEL.linearDamping,
    angularDamping: FEEL.angularDamping,
  });
  if (def.shape.kind === 'torus') {
    addTorusShapes(body, def.shape.radius, def.shape.tube, def.shape.segments);
  } else {
    body.addShape(makeShape(def));
  }
  return body;
}

function makeShape(def: ObjectDef): CANNON.Shape {
  switch (def.shape.kind) {
    case 'box': {
      const [x, y, z] = def.shape.halfExtents;
      return new CANNON.Box(new CANNON.Vec3(x, y, z));
    }
    case 'sphere':
      return new CANNON.Sphere(def.shape.radius);
    case 'cylinder': {
      const { radius, height, segments } = def.shape;
      // cannon-es Cylinder is Y-aligned → matches three.CylinderGeometry directly.
      return new CANNON.Cylinder(radius, radius, height, segments);
    }
    case 'prism':
      return new CANNON.ConvexPolyhedron({
        vertices: PRISM_VERTS.map(([x, y, z]) => new CANNON.Vec3(x, y, z)),
        faces: PRISM_FACES,
      });
    case 'torus':
      // Handled by createBody as a compound (multiple shapes). Never reached.
      throw new Error('torus is built in createBody');
  }
}

/**
 * Torus → compound of spheres in a ring (open center → can be threaded through
 * each other, the M5 chain). The ring lies in the XY plane, same as THREE.TorusGeometry.
 */
function addTorusShapes(body: CANNON.Body, radius: number, tube: number, segments: number): void {
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const offset = new CANNON.Vec3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
    body.addShape(new CANNON.Sphere(tube), offset);
  }
}
