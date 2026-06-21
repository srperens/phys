/**
 * Main-thread handle to the physics worker. Sends commands and forwards the streamed
 * transform frames to a callback. All physics lives in the worker; this is just the
 * messaging surface.
 */
import { DODECA_VERTS, DODECA_FACES } from '../objects/dodeca';
import type { MainToWorker, WorkerToMain } from './protocol';

export type FrameHandler = (count: number, transforms: Float32Array) => void;

export class PhysicsClient {
  private readonly worker: Worker;

  constructor(onFrame: FrameHandler) {
    this.worker = new Worker(new URL('./physicsWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      if (e.data.type === 'frame') onFrame(e.data.count, new Float32Array(e.data.buffer));
    };
    // dodeca hull is computed on the main thread (three) and handed to the worker.
    this.post({ type: 'init', dodecaVerts: DODECA_VERTS, dodecaFaces: DODECA_FACES });
  }

  private post(m: MainToWorker): void {
    this.worker.postMessage(m);
  }

  spawn(id: string, pos: [number, number, number], quat: [number, number, number, number]): void {
    this.post({ type: 'spawn', id, pos, quat });
  }
  spawnChain(): void { this.post({ type: 'spawnChain' }); }
  clear(): void { this.post({ type: 'clear' }); }
  pause(paused: boolean): void { this.post({ type: 'pause', paused }); }
  gravity(value: number): void { this.post({ type: 'gravity', value }); }
  restitution(value: number): void { this.post({ type: 'restitution', value }); }
  walls(on: boolean): void { this.post({ type: 'walls', on }); }
  detonate(center: [number, number, number], strength: number, spin: number): void {
    this.post({ type: 'detonate', center, strength, spin });
  }
  implode(center: [number, number, number], strength: number): void {
    this.post({ type: 'implode', center, strength });
  }
  grabStart(index: number, point: [number, number, number]): void {
    this.post({ type: 'grabStart', index, point });
  }
  grabMove(point: [number, number, number]): void { this.post({ type: 'grabMove', point }); }
  grabEnd(): void { this.post({ type: 'grabEnd' }); }
}
