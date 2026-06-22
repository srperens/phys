/**
 * Interaction — the heart of the feel.
 * Empty space → orbit the camera. A hit on a shape → grip it (the worker owns the
 * constraint; we just stream the drag target). Default drag moves horizontally (X/Z);
 * hold Shift to set height. Off-center grabs tumble on throw (handled in the worker).
 *
 * Two drag-vector tools, each on a held key: the pull vector's length is power, its
 * direction is the aim (the shot goes opposite the pull, like a pool cue / slingshot).
 *   · Cue (hold C): press-hold a shape, drag back, release → impulse at the hit point
 *     (off-centre hits spin).
 *   · Slingshot (hold V): press anywhere, drag back, release → launches a fresh ball
 *     from the launch point.
 *
 * Fly mode (toggle with F): a free-fly camera — WASD moves you through the world (Q/E
 * down/up, Shift to sprint), drag to look around freely. Orbit/grab/aim are suspended
 * while flying; toggle back off to interact.
 */
import * as THREE from 'three';
import { BOARD, PALETTE } from '../config';
import type { RenderContext } from '../render/scene';
import type { Sandbox } from '../sandbox';

const TARGET = new THREE.Vector3(0, 0.5, 0);

/** Fly-mode movement speed (units/s) and sprint multiplier. */
const FLY_SPEED = 12;
const FLY_SPRINT = 2.6;
/** Look sensitivity (radians per pixel of drag) for the fly camera — high enough to
 *  spin around without running out of mouse, but not twitchy. */
const LOOK_SENS = 0.008;

/** Aim feel: the pull-back distance (world units) that maps to full power (cue + sling). */
const DRAG_FULL = 6;
/** Cue impulse range (a faint nudge → a full-power smack). */
const CUE_MIN_IMPULSE = 20;
const CUE_MAX_IMPULSE = 250;
/** Slingshot: launch height, and the ball's launch-speed range. */
const SLING_LAUNCH_Y = 1.2;
const SLING_MIN_SPEED = 12;
const SLING_MAX_SPEED = 70;

export interface Controls {
  resetCamera: () => void;
  setFly: (on: boolean) => void;
  isFlying: () => boolean;
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
  let mode: 'idle' | 'orbit' | 'grab' | 'cue' | 'sling' | 'look' = 'idle';
  let lastX = 0;
  let lastY = 0;
  const dragTarget = new THREE.Vector3(); // current world point the grabbed body is pulled to
  const plane = new THREE.Plane();
  const planePoint = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  // --- Aim state (shared by the cue and the slingshot: a drag vector → power + dir) ---
  let cueKeyDown = false; // C → cue: strike an existing shape
  let slingKeyDown = false; // V → slingshot: launch a fresh ball
  let cueIndex = -1; // body the cue will strike
  let aimRatio = 0; // power 0..1, from the pull-back length
  const aimAnchor = new THREE.Vector3(); // cue: the hit point · sling: the launch point
  const aimDir = new THREE.Vector3(); // shot direction (opposite the pull); horizontal
  const aimPlane = new THREE.Plane(); // horizontal plane the drag rides on
  const aimDragPoint = new THREE.Vector3();
  const aimDrag = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  // Aiming stick: tail under the cursor (where you pull to), head points out in the shot
  // direction; longer pull = more power.
  const aimArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, PALETTE.amber, 0.4, 0.24);
  aimArrow.visible = false;
  render.scene.add(aimArrow);
  // Ghost ball at the slingshot's launch point while aiming.
  const slingGhost = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.4 }),
  );
  slingGhost.visible = false;
  render.scene.add(slingGhost);

  // Drag rides a horizontal plane at the anchor; the pull vector (anchor → cursor) sets
  // power (length) and aim (the shot goes the opposite way).
  const updateAim = () => {
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(aimPlane, aimDragPoint)) return;
    aimDrag.copy(aimDragPoint).sub(aimAnchor);
    aimDrag.y = 0;
    const len = aimDrag.length();
    aimRatio = Math.min(1, len / DRAG_FULL);
    if (len < 0.05) {
      aimDir.set(0, 0, 0);
      aimArrow.visible = false;
      return;
    }
    aimDir.copy(aimDrag).multiplyScalar(-1 / len); // shot dir = normalized pull, reversed
    aimArrow.position.copy(aimDragPoint); // tail under the cursor
    aimArrow.setDirection(aimDir); // head points out in the shot direction
    aimArrow.setLength(len, 0.4, 0.24);
    aimArrow.visible = true;
  };

  // --- Fly state (free-fly camera; position + free yaw/pitch, no orbit target) ---
  let flying = false;
  let yaw = 0;
  let pitch = 0;
  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const moveKeys = new Set<string>(); // currently held movement keys (wasd/qe/shift)
  const moveVec = new THREE.Vector3();
  let flyLast = 0;
  let flyRaf = 0;

  const applyFlyCamera = () => {
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(camPos);
    camera.lookAt(camPos.x + fwd.x, camPos.y + fwd.y, camPos.z + fwd.z);
  };

  const flyTick = () => {
    if (!flying) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - flyLast) / 1000);
    flyLast = now;
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    moveVec.set(0, 0, 0);
    if (moveKeys.has('w')) moveVec.add(fwd);
    if (moveKeys.has('s')) moveVec.sub(fwd);
    // Right = forward × up, kept horizontal (strafing doesn't change height).
    if (moveKeys.has('d')) moveVec.add(tmpV.set(-fwd.z, 0, fwd.x));
    if (moveKeys.has('a')) moveVec.add(tmpV.set(fwd.z, 0, -fwd.x));
    if (moveKeys.has('e')) moveVec.y += 1;
    if (moveKeys.has('q')) moveVec.y -= 1;
    if (moveVec.lengthSq() > 0) {
      const speed = FLY_SPEED * (moveKeys.has('shift') ? FLY_SPRINT : 1) * dt;
      camPos.addScaledVector(moveVec.normalize(), speed);
      applyFlyCamera();
    }
    flyRaf = requestAnimationFrame(flyTick);
  };

  const syncOrbitFromCamera = () => {
    const off = camera.position.clone().sub(TARGET);
    radius = off.length();
    phi = Math.acos(Math.max(-1, Math.min(1, off.y / radius)));
    theta = Math.atan2(off.x, off.z);
    updateCamera();
  };

  const setFly = (on: boolean) => {
    if (on === flying) return;
    flying = on;
    if (on) {
      camPos.copy(camera.position);
      camera.getWorldDirection(camDir);
      yaw = Math.atan2(camDir.x, camDir.z);
      pitch = Math.asin(Math.max(-1, Math.min(1, camDir.y)));
      applyFlyCamera();
      dom.style.cursor = 'move';
      flyLast = performance.now();
      flyTick();
    } else {
      cancelAnimationFrame(flyRaf);
      moveKeys.clear();
      syncOrbitFromCamera(); // resume orbit from where you flew to
      dom.style.cursor = '';
    }
  };

  const MOVE = new Set(['w', 'a', 's', 'd', 'q', 'e', 'shift']);

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') {
      // Freeze the world: physics stops stepping but velocities are kept, so on release
      // everything resumes — and a cue/sling during the freeze loads new motion that
      // fires the moment you unfreeze.
      if (!e.repeat) sandbox.setPaused(!sandbox.paused);
      return;
    }
    if (k === 'escape') {
      if (flying) setFly(false); // leave fly mode back to orbit
      return;
    }
    if (k === 'h') {
      if (!e.repeat) sandbox.stopMotion(); // halt linear motion, keep spin (ignore key-repeat)
      return;
    }
    if (MOVE.has(k)) {
      moveKeys.add(k);
      // WASD/QE just work: tapping a movement key drops you into fly mode (Shift alone
      // doesn't — it's only the sprint modifier). Press F or the Fly button to leave.
      if (!flying && k !== 'shift') setFly(true);
      return;
    }
    if (k === 'c') cueKeyDown = true;
    else if (k === 'v') slingKeyDown = true;
    else return;
    if (mode === 'idle') dom.style.cursor = 'crosshair'; // C/V aim works in fly too
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (MOVE.has(k)) {
      moveKeys.delete(k);
      return;
    }
    if (k === 'c') cueKeyDown = false;
    else if (k === 'v') slingKeyDown = false;
    else return;
    if (mode !== 'cue' && mode !== 'sling') {
      dom.style.cursor = cueKeyDown || slingKeyDown ? 'crosshair' : flying ? 'move' : '';
    }
  });

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

    if (slingKeyDown) {
      // Slingshot: anchor on a horizontal plane in front (no shape needed); drag back to
      // aim/power, release launches a ball.
      mode = 'sling';
      aimRatio = 0;
      aimDir.set(0, 0, 0);
      aimPlane.setFromNormalAndCoplanarPoint(tmpN.set(0, 1, 0), tmpV.set(0, SLING_LAUNCH_Y, 0));
      if (!raycaster.ray.intersectPlane(aimPlane, aimAnchor)) aimAnchor.set(0, SLING_LAUNCH_Y, 0);
      slingGhost.position.copy(aimAnchor);
      slingGhost.visible = true;
      aimArrow.visible = false; // appears once you start pulling back
    } else if (hit && index != null && cueKeyDown) {
      // Cue: anchor at the hit point; the drag (next moves) sets power and aim.
      mode = 'cue';
      cueIndex = index;
      aimAnchor.copy(hit.point);
      aimDir.set(0, 0, 0);
      aimRatio = 0;
      aimPlane.setFromNormalAndCoplanarPoint(tmpN.set(0, 1, 0), aimAnchor);
      aimArrow.visible = false; // appears once you start pulling back
    } else if (hit && index != null) {
      // Hitting a shape grabs it — in orbit and fly alike.
      mode = 'grab';
      dragTarget.copy(hit.point);
      sandbox.grabStart(index, [hit.point.x, hit.point.y, hit.point.z]);
    } else if (flying) {
      // Fly mode, empty space → a plain drag looks around.
      mode = 'look';
      lastX = e.clientX;
      lastY = e.clientY;
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
    } else if (mode === 'cue' || mode === 'sling') {
      setNdc(e);
      updateAim();
    } else if (mode === 'look') {
      yaw -= (e.clientX - lastX) * LOOK_SENS;
      pitch -= (e.clientY - lastY) * LOOK_SENS;
      lastX = e.clientX;
      lastY = e.clientY;
      applyFlyCamera();
    }
  });

  const release = (e: PointerEvent) => {
    if (mode === 'grab') {
      sandbox.grabEnd();
    } else if (mode === 'cue') {
      if (aimRatio > 0 && aimDir.lengthSq() > 0) {
        const mag = CUE_MIN_IMPULSE + aimRatio * (CUE_MAX_IMPULSE - CUE_MIN_IMPULSE);
        sandbox.strike(
          cueIndex,
          [aimDir.x * mag, aimDir.y * mag, aimDir.z * mag],
          [aimAnchor.x, aimAnchor.y, aimAnchor.z],
        );
      }
      aimArrow.visible = false;
      dom.style.cursor = cueKeyDown || slingKeyDown ? 'crosshair' : '';
    } else if (mode === 'sling') {
      if (aimRatio > 0 && aimDir.lengthSq() > 0) {
        const speed = SLING_MIN_SPEED + aimRatio * (SLING_MAX_SPEED - SLING_MIN_SPEED);
        sandbox.launchBall(
          [aimAnchor.x, aimAnchor.y, aimAnchor.z],
          [aimDir.x * speed, aimDir.y * speed, aimDir.z * speed],
        );
      }
      aimArrow.visible = false;
      slingGhost.visible = false;
      dom.style.cursor = cueKeyDown || slingKeyDown ? 'crosshair' : '';
    }
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
      if (flying) {
        camPos.addScaledVector(fwd, -dy * 0.05); // dolly forward/back along the look direction
        applyFlyCamera();
      } else {
        radius *= Math.exp(dy * 0.01);
        updateCamera();
      }
    },
    { passive: false },
  );

  return {
    resetCamera: () => {
      setFly(false);
      radius = initialRadius;
      phi = initialPhi;
      theta = initialTheta;
      updateCamera();
    },
    setFly,
    isFlying: () => flying,
  };
}
