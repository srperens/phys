/**
 * Procedural checkerboard ("square") texture, generated on a canvas so the bundle
 * stays self-contained (no external image assets). One shared instance for all
 * objects. Used as a color map that multiplies each object's palette color, so
 * shapes keep their hue but gain a square grid — which also makes rotation and
 * tumble easy to read.
 */
import * as THREE from 'three';

let cached: THREE.Texture | null = null;

export function checkerTexture(): THREE.Texture {
  if (cached) return cached;

  const size = 256;
  const cells = 4; // squares per axis across one UV unit
  const cell = size / cells;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // Light squares pass the full color through; dark squares dim it.
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#9c9c9c';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cached = tex;
  return tex;
}
