/**
 * Render layer. Only mirrors the physics. Dark, clean scene with soft shadows.
 */
import * as THREE from 'three';
import { PALETTE, BOARD } from '../config';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
}

export function createRenderer(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  // Pleasant default — angled from above.
  camera.position.set(7, 6, 9);
  camera.lookAt(0, 0, 0);

  setupLights(scene);
  setupBoard(scene);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, resize };
}

function setupLights(scene: THREE.Scene): void {
  const ambient = new THREE.HemisphereLight(0xc7d4e1, 0x3a4048, 0.9);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2e0, 1.35);
  key.position.set(6, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  const d = 14;
  key.shadow.camera.left = -d;
  key.shadow.camera.right = d;
  key.shadow.camera.top = d;
  key.shadow.camera.bottom = -d;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8fa0d4, 0.5);
  fill.position.set(-8, 5, -6);
  scene.add(fill);
}

function setupBoard(scene: THREE.Scene): void {
  const size = BOARD.size;

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      color: PALETTE.board,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  board.rotation.x = -Math.PI / 2;
  board.receiveShadow = true;
  scene.add(board);

  // Subtle grid as a motion reference.
  const grid = new THREE.GridHelper(size, size, PALETTE.grid, PALETTE.grid);
  (grid.material as THREE.Material).opacity = 0.35;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.001;
  scene.add(grid);
}
