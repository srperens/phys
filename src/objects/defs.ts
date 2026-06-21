/**
 * Data-driven object definitions. A new figure should be an object in this list,
 * not new code in three files. Physics (bodyFactory) and rendering (meshFactory)
 * each interpret their part of the same ShapeDef.
 */
import { PALETTE } from '../config';

export type ShapeDef =
  | { kind: 'box'; halfExtents: [number, number, number] }
  | { kind: 'sphere'; radius: number }
  | { kind: 'cylinder'; radius: number; height: number; segments: number }
  | { kind: 'prism' } // triangular prism, geometry in prism.ts
  | { kind: 'torus'; radius: number; tube: number; segments: number }; // collider = ring of spheres

export interface ObjectDef {
  id: string;
  label: string;
  shape: ShapeDef;
  mass: number;
  color: number;
}

/** Masses are chosen so the weight feel differs between types (see grip knob, M2). */
export const OBJECT_DEFS: Record<string, ObjectDef> = {
  ball: {
    id: 'ball',
    label: 'Ball',
    shape: { kind: 'sphere', radius: 0.55 },
    mass: 3,
    color: PALETTE.teal,
  },
  cube: {
    id: 'cube',
    label: 'Cube',
    shape: { kind: 'box', halfExtents: [0.5, 0.5, 0.5] },
    mass: 4,
    color: PALETTE.coral,
  },
  plate: {
    id: 'plate',
    label: 'Plate',
    shape: { kind: 'box', halfExtents: [0.7, 0.12, 0.7] },
    mass: 2.5,
    color: PALETTE.warmWhite,
  },
  domino: {
    id: 'domino',
    label: 'Domino',
    shape: { kind: 'box', halfExtents: [0.28, 0.62, 0.12] },
    mass: 2,
    color: PALETTE.indigo,
  },
  cylinder: {
    id: 'cylinder',
    label: 'Cylinder',
    shape: { kind: 'cylinder', radius: 0.45, height: 1.0, segments: 16 },
    mass: 3.5,
    color: PALETTE.amber,
  },
  prism: {
    id: 'prism',
    label: 'Prism',
    shape: { kind: 'prism' },
    mass: 3,
    color: PALETTE.slate,
  },
  torus: {
    id: 'torus',
    label: 'Torus',
    // Cannon has no native torus → the collider is built as a ring of small spheres.
    // Big ring + thick tube, but the hole (radius - tube) stays wide so chain links
    // still interlock with room to spare.
    shape: { kind: 'torus', radius: 0.85, tube: 0.24, segments: 18 },
    mass: 5,
    color: PALETTE.warmWhite,
  },
};

export const OBJECT_LIST: ObjectDef[] = Object.values(OBJECT_DEFS);
