/**
 * Render layer. Only mirrors the physics. Dark, clean scene with soft shadows.
 */
import * as THREE from 'three';
import { PALETTE, BOARD, GROUND_TONES } from '../config';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Translucent boundary-wall panels; hidden until walls are toggled on. */
  wallGroup: THREE.Group;
  resize: () => void;
}

export function createRenderer(canvas: HTMLCanvasElement): RenderContext {
  // Prefer the discrete GPU on dual-GPU laptops.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
  const wallGroup = setupWalls(scene);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, wallGroup, resize };
}

function setupLights(scene: THREE.Scene): void {
  const ambient = new THREE.HemisphereLight(0xc7d4e1, 0x3a4048, 0.9);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2e0, 1.35);
  key.position.set(6, 12, 8);
  key.castShadow = true;
  // Cover well beyond the board so shapes flung onto the surrounding ground still cast
  // shadows; a bigger map keeps the larger frustum from looking soft.
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  const d = 26;
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

  // Outer ground: a patchwork of board-sized tiles in different muted tones, tiled
  // around the arena so the world reads as many boards rather than one sterile floor.
  // The central tile is left out — the brighter arena board sits there.
  const tiles = 5; // 5×5 grid of board-sized tiles → outer ground is 5× the board
  const outerSize = size * tiles;
  const half = (tiles - 1) / 2;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      if (i === half && j === half) continue; // arena tile — covered by the board
      // Deterministic, neighbour-varying tone pick so adjacent tiles differ.
      const tone = GROUND_TONES[(i * 3 + j * 5 + i * j) % GROUND_TONES.length];
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({ color: tone, roughness: 1, metalness: 0 }),
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set((i - half) * size, -0.04, (j - half) * size);
      tile.receiveShadow = true;
      scene.add(tile);
    }
  }

  // Grid over the whole outer ground, same 1-unit cells as the board so the squares
  // line up. Sits just below the board top, so the opaque board occludes it within
  // the arena (no doubled lines) and it only shows on the surrounding ground.
  const outerGrid = new THREE.GridHelper(outerSize, outerSize, PALETTE.grid, PALETTE.grid);
  (outerGrid.material as THREE.Material).opacity = 0.16;
  (outerGrid.material as THREE.Material).transparent = true;
  outerGrid.position.y = -0.005;
  scene.add(outerGrid);

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

  // Subtle grid as a motion reference — the brighter arena grid on top of the board.
  const grid = new THREE.GridHelper(size, size, PALETTE.grid, PALETTE.grid);
  (grid.material as THREE.Material).opacity = 0.35;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.001;
  scene.add(grid);
}

/** Translucent glass-like panels at the board edges. Hidden until walls toggle on. */
function setupWalls(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.visible = false;

  const height = BOARD.wallHeight;
  const half = BOARD.half - BOARD.wallInset;
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.teal,
    transparent: true,
    opacity: 0.13,
    roughness: 0.5,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // [position, rotationY] for the four edges. Plane spans the board width × height.
  const edges: Array<[THREE.Vector3, number]> = [
    [new THREE.Vector3(0, height / 2, half), 0],
    [new THREE.Vector3(0, height / 2, -half), 0],
    [new THREE.Vector3(half, height / 2, 0), Math.PI / 2],
    [new THREE.Vector3(-half, height / 2, 0), Math.PI / 2],
  ];

  for (const [pos, rotY] of edges) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, height), mat);
    panel.position.copy(pos);
    panel.rotation.y = rotY;
    group.add(panel);

    // A faint bright rim along the top edge so the wall extent is easy to read.
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2, 0.04, 0.04),
      new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.5 }),
    );
    rim.position.set(pos.x, height, pos.z);
    rim.rotation.y = rotY;
    group.add(rim);
  }

  scene.add(group);
  return group;
}
