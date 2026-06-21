/**
 * Message protocol between the main thread and the physics Web Worker.
 * Physics lives entirely in the worker; the main thread renders from the
 * streamed transforms and sends commands (spawn, grab, forces, …).
 */

export type MainToWorker =
  | { type: 'init'; dodecaVerts: number[][]; dodecaFaces: number[][] }
  | { type: 'spawn'; id: string; pos: [number, number, number]; quat: [number, number, number, number] }
  | { type: 'spawnChain' }
  | { type: 'clear' }
  | { type: 'pause'; paused: boolean }
  | { type: 'gravity'; value: number }
  | { type: 'restitution'; value: number }
  | { type: 'walls'; on: boolean }
  | { type: 'detonate'; center: [number, number, number]; strength: number; spin: number }
  | { type: 'implode'; center: [number, number, number]; strength: number }
  | { type: 'grabStart'; index: number; point: [number, number, number] }
  | { type: 'grabMove'; point: [number, number, number] }
  | { type: 'grabEnd' };

export type WorkerToMain =
  /** Flat transforms: 7 floats per body (x,y,z, qx,qy,qz,qw) in spawn order. */
  | { type: 'frame'; count: number; buffer: ArrayBuffer };

/** Floats per body in the transform buffer. */
export const STRIDE = 7;
