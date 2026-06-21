/**
 * Interaction — the heart of the feel.
 * Empty space → orbit the camera. A hit on a shape → grip via PointToPointConstraint.
 * The off-center pivot produces torque → the shape tumbles and spins when thrown.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FEEL } from '../config';
import type { RenderContext } from '../render/scene';
import type { Sandbox } from '../sandbox';

const TARGET = new THREE.Vector3(0, 0.5, 0);

export interface Controls {
  /** Restore the camera to its default angle/zoom. */
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
  const initialPhi = Math.acos(offset.y / initialRadius); // angle from +Y
  const initialTheta = Math.atan2(offset.x, offset.z); // turn around Y
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
  let grabbed: CANNON.Body | null = null;
  let grabbedAllowSleep = true;
  let jointBody: CANNON.Body | null = null;
  let constraint: CANNON.PointToPointConstraint | null = null;
  const plane = new THREE.Plane();
  const planePoint = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  const setNdc = (e: PointerEvent) => {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };

  const beginGrab = (body: CANNON.Body, hitPoint: THREE.Vector3) => {
    grabbed = body;
    grabbedAllowSleep = body.allowSleep;
    body.allowSleep = false;
    body.wakeUp();
    // Calm the held object so it hangs steady instead of spinning on its own.
    // Restored on release, so a quick flick still tumbles the throw.
    body.angularDamping = 0.9;
    body.linearDamping = 0.4;

    // Pivot in the body's LOCAL coordinates at the hit point → off-center grip.
    const worldHit = new CANNON.Vec3(hitPoint.x, hitPoint.y, hitPoint.z);
    const pivotLocal = new CANNON.Vec3();
    body.pointToLocalFrame(worldHit, pivotLocal);

    // Kinematic joint body without collision.
    jointBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    jointBody.collisionResponse = false;
    jointBody.position.copy(worldHit);
    sandbox.world.addBody(jointBody);

    constraint = new CANNON.PointToPointConstraint(
      body,
      pivotLocal,
      jointBody,
      new CANNON.Vec3(0, 0, 0),
      FEEL.gripMaxForce, // NOT mass-scaled → heavy shapes lag = feel heavy
    );
    sandbox.world.addConstraint(constraint);
  };

  /**
   * Drag mapping:
   *  - default → move horizontally (X/Z) at the current height (slide on the board).
   *  - Shift   → move vertically (set height), keeping X/Z.
   * This keeps the two axes independent so positioning feels deliberate.
   */
  const moveGrab = (shift: boolean) => {
    if (!jointBody) return;
    raycaster.setFromCamera(ndc, camera);
    tmpP.set(jointBody.position.x, jointBody.position.y, jointBody.position.z);

    if (shift) {
      // Vertical plane facing the camera (horizontally) → ray height sets Y.
      camera.getWorldDirection(camDir);
      const len = Math.hypot(camDir.x, camDir.z) || 1;
      plane.setFromNormalAndCoplanarPoint(tmpN.set(camDir.x / len, 0, camDir.z / len), tmpP);
      if (raycaster.ray.intersectPlane(plane, planePoint)) {
        jointBody.position.y = Math.max(0.2, planePoint.y);
      }
    } else {
      // Horizontal plane at the current height → ray sets X/Z.
      plane.setFromNormalAndCoplanarPoint(tmpN.set(0, 1, 0), tmpP);
      if (raycaster.ray.intersectPlane(plane, planePoint)) {
        jointBody.position.x = planePoint.x;
        jointBody.position.z = planePoint.z;
      }
    }
  };

  const endGrab = () => {
    if (constraint) sandbox.world.removeConstraint(constraint);
    if (jointBody) sandbox.world.removeBody(jointBody);
    if (grabbed) {
      grabbed.allowSleep = grabbedAllowSleep;
      grabbed.angularDamping = FEEL.angularDamping;
      grabbed.linearDamping = FEEL.linearDamping;
    }
    // The body keeps its velocity → throw. Off-center pivot → tumble.
    constraint = null;
    jointBody = null;
    grabbed = null;
  };

  // --- Events ---
  dom.addEventListener('pointerdown', (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(sandbox.pickables, false);
    const hit = hits[0];
    const body = hit?.object.userData.body as CANNON.Body | undefined;

    if (hit && body) {
      mode = 'grab';
      beginGrab(body, hit.point);
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
    if (mode === 'grab') endGrab();
    mode = 'idle';
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);

  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      radius *= 1 + e.deltaY * 0.001;
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
