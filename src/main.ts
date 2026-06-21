/**
 * main — glues the layers together and runs the loop.
 */
import * as THREE from 'three';
import { createRenderer } from './render/scene';
import { Sandbox } from './sandbox';
import { installControls } from './interaction/controls';
import { createPanel } from './ui/panel';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const render = createRenderer(canvas);
const sandbox = new Sandbox(render);
const controls = installControls(sandbox, render);
createPanel(sandbox, controls);

// Starter scene: drop a few shapes so there is something to grab right away.
sandbox.spawnStarterScene();

// Dev-only handle for tooling/tests (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as { __phys?: unknown }).__phys = { sandbox, render, THREE };
}

// The worker steps physics off-thread and streams transforms (applied into the
// instance matrices as they arrive); the render loop just draws the latest state.
function loop(): void {
  render.renderer.render(render.scene, render.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
