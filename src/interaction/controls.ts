/**
 * Interaction — the heart of the feel.
 * Empty space → orbit the camera. A hit on a shape → grip it (the worker owns the
 * constraint; we just stream the drag target). Default drag moves horizontally (X/Z);
 * hold Shift to set height. Off-center grabs tumble on throw (handled in the worker).
 */
import * as THREE from 'three';
import { BOARD } from '../config';
import type { RenderContext } from '../render/scene';
import type { Sandbox } from '../sandbox';

const TARGET = new THREE.Vector3(0, 0.5, 0);

export interface Controls {
  resetCamera: () => void;
}

export function installControls(sandbox: Sandbox, render: RenderContext): Controls {
  const { camera, renderer } = render;
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // --- Orbit state (spherical coordinates around TARGET) ---
  const offset = camera.position.clone().sub(TARGET);
  const initialRadius = offset.length();
  const initialPhi = Math.acos(offset.y / initialRadius);
  const initialTheta = Math.atan2(offset.x, offset.z);
  let radius = initialRadius;
  let phi = initialPhi;
  let theta = initialTheta;

  const updateCamera = () => {
    phi = Math.max(0.12, Math.min(1.5, phi));
    radius = Math.max(3, Math.min(45, radius));
    camera.position.set(
      TARGET.x + radius * Math.sin(phi) * Math.sin(theta),
      TARGET.y + radius * Math.cos(phi),
      TARGET.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(TARGET);
  };
  updateCamera();

  // --- Grip state ---
  let mode: 'idle' | 'orbit' | 'grab' = 'idle';
  let lastX = 0;
  let lastY = 0;
  const dragTarget = new THREE.Vector3(); // current world point the grabbed body is pulled to
  const plane = new THREE.Plane();
  const planePoint = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  const setNdc = (e: PointerEvent) => {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };

  const sendTarget = () => {
    if (sandbox.wallsEnabled) {
      const lim = BOARD.half - BOARD.wallInset - 0.9;
      dragTarget.x = Math.max(-lim, Math.min(lim, dragTarget.x));
      dragTarget.z = Math.max(-lim, Math.min(lim, dragTarget.z));
    }
    sandbox.grabMove([dragTarget.x, dragTarget.y, dragTarget.z]);
  };

  const moveGrab = (shift: boolean) => {
    raycaster.setFromCamera(ndc, camera);
    if (shift) {
      camera.getWorldDirection(camDir);
      const len = Math.hypot(camDir.x, camDir.z) || 1;
      plane.setFromNormalAndCoplanarPoint(tmpN.set(camDir.x / len, 0, camDir.z / len), dragTarget);
      if (raycaster.ray.intersectPlane(plane, planePoint)) {
        dragTarget.y = Math.max(0.2, planePoint.y);
      }
    } else {
      plane.setFromNormalAndCoplanarPoint(tmpN.set(0, 1, 0), dragTarget);
      if (raycaster.ray.intersectPlane(plane, planePoint)) {
        dragTarget.x = planePoint.x;
        dragTarget.z = planePoint.z;
      }
    }
    sendTarget();
  };

  // --- Events ---
  dom.addEventListener('pointerdown', (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(sandbox.pickables, false)[0];
    const index = hit && hit.instanceId != null ? sandbox.indexAt(hit.object, hit.instanceId) : undefined;

    if (hit && index != null) {
      mode = 'grab';
      dragTarget.copy(hit.point);
      sandbox.grabStart(index, [hit.point.x, hit.point.y, hit.point.z]);
    } else {
      mode = 'orbit';
      lastX = e.clientX;
      lastY = e.clientY;
    }
    dom.setPointerCapture(e.pointerId);
  });

  dom.addEventListener('pointermove', (e) => {
    if (mode === 'orbit') {
      theta -= (e.clientX - lastX) * 0.005;
      phi -= (e.clientY - lastY) * 0.005;
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    } else if (mode === 'grab') {
      setNdc(e);
      moveGrab(e.shiftKey);
    }
  });

  const release = (e: PointerEvent) => {
    if (mode === 'grab') sandbox.grabEnd();
    mode = 'idle';
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);

  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const dy = Math.max(-25, Math.min(25, e.deltaY));
      radius *= Math.exp(dy * 0.01);
      updateCamera();
    },
    { passive: false },
  );

  return {
    resetCamera: () => {
      radius = initialRadius;
      phi = initialPhi;
      theta = initialTheta;
      updateCamera();
    },
  };
}
