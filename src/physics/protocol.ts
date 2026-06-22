/**
 * Message protocol between the main thread and the physics Web Worker.
 * Physics lives entirely in the worker; the main thread renders from the
 * streamed transforms and sends commands (spawn, grab, forces, …).
 */

export type MainToWorker =
  | { type: 'init' }
  | { type: 'spawn'; gen: number; id: string; pos: [number, number, number]; quat: [number, number, number, number]; vel?: [number, number, number] }
  | { type: 'spawnChain'; gen: number }
  | { type: 'structure'; gen: number; name: string; offset: [number, number, number] }
  | { type: 'clear'; gen: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'gravity'; value: number }
  | { type: 'restitution'; value: number }
  | { type: 'walls'; on: boolean }
  | { type: 'detonate'; center: [number, number, number]; strength: number; spin: number }
  | { type: 'implode'; center: [number, number, number]; strength: number }
  | { type: 'stopMotion' }
  | { type: 'strike'; index: number; impulse: [number, number, number]; point: [number, number, number] }
  | { type: 'grabStart'; index: number; point: [number, number, number] }
  | { type: 'grabMove'; point: [number, number, number] }
  | { type: 'grabEnd' };

export type WorkerToMain =
  /** Flat transforms: 7 floats per body (x,y,z, qx,qy,qz,qw) in spawn order.
   *  `gen` is the structural generation this frame reflects; the main thread only
   *  applies a frame whose gen matches its current one (worker has caught up). */
  | { type: 'frame'; gen: number; count: number; buffer: ArrayBuffer };

/** Floats per body in the transform buffer. */
export const STRIDE = 7;
