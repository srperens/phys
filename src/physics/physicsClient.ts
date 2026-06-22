/**
 * Main-thread handle to the physics worker. Sends commands and forwards the streamed
 * transform frames to a callback. All physics lives in the worker; this is just the
 * messaging surface.
 */
import type { MainToWorker, WorkerToMain } from './protocol';

export type FrameHandler = (gen: number, count: number, transforms: Float32Array) => void;

export class PhysicsClient {
  private readonly worker: Worker;

  constructor(onFrame: FrameHandler) {
    this.worker = new Worker(new URL('./physicsWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      if (e.data.type === 'frame') onFrame(e.data.gen, e.data.count, new Float32Array(e.data.buffer));
    };
    this.post({ type: 'init' });
  }

  private post(m: MainToWorker): void {
    this.worker.postMessage(m);
  }

  spawn(
    gen: number,
    id: string,
    pos: [number, number, number],
    quat: [number, number, number, number],
    vel?: [number, number, number],
  ): void {
    this.post({ type: 'spawn', gen, id, pos, quat, vel });
  }
  spawnChain(gen: number): void { this.post({ type: 'spawnChain', gen }); }
  structure(gen: number, name: string, offset: [number, number, number]): void {
    this.post({ type: 'structure', gen, name, offset });
  }
  clear(gen: number): void { this.post({ type: 'clear', gen }); }
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
  stopMotion(): void { this.post({ type: 'stopMotion' }); }
  strike(index: number, impulse: [number, number, number], point: [number, number, number]): void {
    this.post({ type: 'strike', index, impulse, point });
  }
  grabStart(index: number, point: [number, number, number]): void {
    this.post({ type: 'grabStart', index, point });
  }
  grabMove(point: [number, number, number]): void { this.post({ type: 'grabMove', point }); }
  grabEnd(): void { this.post({ type: 'grabEnd' }); }
}
