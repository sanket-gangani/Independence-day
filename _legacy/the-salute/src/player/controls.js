import * as THREE from 'three';
import { terrainHeight, PATH_START } from '../world/terrain.js';

/**
 * Input, locomotion and the third-person camera.
 *
 * Movement is body-relative and completely decoupled from the camera:
 *
 *   up / down    walk forward or back along the soldier's own facing
 *   left / right turn the soldier
 *   mouse        orbit the camera, and nothing else
 *
 * The camera sits at `heading + orbitYaw`, so steering swings the view along
 * with the body and the offset the player dialled in is preserved. Nothing
 * re-centres it behind them on its own.
 *
 * This replaced camera-relative movement, where "forward" was whichever way
 * the camera happened to point. That meant looking around silently redefined
 * which way the walk keys went, and the soldier would set off somewhere the
 * player had not asked for.
 */

const WALK_SPEED = 2.0; // m/s
const TURN_RATE = 1.9; // rad/s the soldier turns under A/D
const CAM_DISTANCE = 4.7;
// Kept deliberately low: any higher and the 50° lens pitches down far enough
// to push the horizon — and therefore the whole sunrise — out of frame.
const CAM_HEIGHT = 0.62;
const CAM_LOOK_HEIGHT = 1.45;

export function createControls(camera, domElement) {
  const position = new THREE.Vector3(PATH_START.x, 0, PATH_START.z);
  position.y = terrainHeight(position.x, position.z);

  let heading = Math.PI; // facing -Z, toward the flagpole
  let orbitYaw = 0;
  let orbitPitch = 0.12;
  let locked = false;
  let enabled = false;
  let enabledAt = 0;
  let moving = false;
  let speed = 0;

  const keys = new Set();

  // --- input --------------------------------------------------------------

  const KEYMAP = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
  };

  function onKeyDown(e) {
    const k = KEYMAP[e.code];
    if (k) {
      keys.add(k);
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // --- mouse look ---------------------------------------------------------
  //
  // Two ways to steer the camera, because both are things people reach for:
  //   * click the scene to capture the pointer, then just move the mouse
  //   * or drag, if you would rather not have the cursor taken away
  // Esc releases the capture; the browser handles that for us.

  let dragging = false;
  let pointerLocked = false;
  let lastX = 0;
  let lastY = 0;

  const YAW_SENS = 0.0026;
  const PITCH_SENS = 0.0019;

  function applyLook(dx, dy) {
    if (dx === 0 && dy === 0) return;
    orbitYaw -= dx * YAW_SENS;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * PITCH_SENS, -0.3, 0.78);
  }

  function onCanvasClick() {
    if (!enabled || pointerLocked) return;
    // The very click that dismisses the title card should not also swallow the
    // cursor — let that gesture finish first.
    if (performance.now() < enabledAt + 500) return;
    domElement.requestPointerLock?.();
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === domElement;
  }

  function onMouseMove(e) {
    if (!pointerLocked) return;
    applyLook(e.movementX || 0, e.movementY || 0);
  }

  function onPointerDown(e) {
    if (!enabled || pointerLocked) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    domElement.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || pointerLocked) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyLook(dx * 1.9, dy * 1.6);
  }
  function onPointerUp(e) {
    dragging = false;
    domElement.releasePointerCapture?.(e.pointerId);
  }
  function onContextMenu(e) {
    e.preventDefault();
  }

  domElement.addEventListener('click', onCanvasClick);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('contextmenu', onContextMenu);

  // --- touch: drag on the lower third of the screen walks forward ---------

  let touchWalk = false;
  domElement.addEventListener(
    'touchstart',
    (e) => {
      if (!enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientY > window.innerHeight * 0.66) touchWalk = true;
      }
    },
    { passive: true }
  );
  domElement.addEventListener('touchend', () => {
    touchWalk = false;
  });

  // --- camera state -------------------------------------------------------

  const camTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const smoothedLook = new THREE.Vector3();
  let initialised = false;

  const forward = new THREE.Vector3();

  // Camera yaw actually used, eased toward heading + orbit offset.
  let camYaw = heading;

  function cameraYawTarget() {
    return heading + orbitYaw;
  }

  const api = {
    position,
    get heading() {
      return heading;
    },
    get moving() {
      return moving;
    },
    /** Signed: negative when backing up. */
    get speed() {
      return speed;
    },
    get locked() {
      return locked;
    },

    setEnabled(v) {
      enabled = v;
      if (v) enabledAt = performance.now();
      else keys.clear();
    },

    /** Freezes locomotion but leaves the camera free (used during the hoist). */
    setLocked(v) {
      locked = v;
      if (v) keys.clear();
    },

    /**
     * @param dt seconds
     * @param driveCamera when false, locomotion still runs but the camera is
     *   left alone — the cinematic rig owns it. Without this the follow camera
     *   damps back toward its own target every frame and drags the cinematic
     *   framing with it.
     */
    update(dt, driveCamera = true) {
      // ---- intent ----
      // Two independent axes, not a direction vector: iz is throttle, ix is
      // steering. They are not normalised against each other — walking and
      // turning at the same time should do both at full rate.
      let ix = 0;
      let iz = 0;
      if (enabled && !locked) {
        if (keys.has('up') || touchWalk) iz += 1;
        if (keys.has('down')) iz -= 1;
        if (keys.has('left')) ix -= 1;
        if (keys.has('right')) ix += 1;
      }

      // Left/right steer the soldier; they do not strafe. Turning the body is
      // what makes "forward" mean something the player can predict.
      if (ix !== 0) heading -= ix * TURN_RATE * dt;

      // Forward is the direction the SOLDIER faces — never the camera's.
      // Deriving it from the camera means every mouse movement silently
      // redefines which way W walks, which is exactly what felt broken.
      forward.set(Math.sin(heading), 0, Math.cos(heading));

      const targetSpeed = iz !== 0 ? WALK_SPEED * (iz > 0 ? 1 : -0.55) : 0;
      // Ease speed in and out so starts and stops are not instant.
      speed = THREE.MathUtils.damp(speed, targetSpeed, iz !== 0 ? 6 : 9, dt);
      moving = Math.abs(speed) > 0.08;

      position.x += forward.x * speed * dt;
      position.z += forward.z * speed * dt;

      position.y = terrainHeight(position.x, position.z);

      // ---- camera ----
      const steering = dragging || pointerLocked;
      let yawDelta = cameraYawTarget() - camYaw;
      yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
      camYaw += yawDelta * Math.min(1, (steering ? 24 : 4.2) * dt);

      camTarget.set(position.x, position.y + CAM_LOOK_HEIGHT, position.z);

      const horiz = CAM_DISTANCE * Math.cos(orbitPitch);
      camDesired.set(
        camTarget.x - Math.sin(camYaw) * horiz,
        camTarget.y + CAM_HEIGHT + CAM_DISTANCE * Math.sin(orbitPitch),
        camTarget.z - Math.cos(camYaw) * horiz
      );

      // Never let the camera bury itself in a drift.
      const groundAtCam = terrainHeight(camDesired.x, camDesired.z) + 0.9;
      if (camDesired.y < groundAtCam) camDesired.y = groundAtCam;

      lookAt.copy(camTarget);

      if (!driveCamera) {
        // Keep the follow target tracking the soldier so handing control back
        // later starts from a sane place, but do not move the camera.
        smoothedLook.copy(lookAt);
        return { camDesired, camTarget, smoothedLook };
      }

      if (!initialised) {
        camera.position.copy(camDesired);
        smoothedLook.copy(lookAt);
        initialised = true;
      } else {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camDesired.x, 5.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camDesired.y, 4.0, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camDesired.z, 5.5, dt);
        smoothedLook.x = THREE.MathUtils.damp(smoothedLook.x, lookAt.x, 7, dt);
        smoothedLook.y = THREE.MathUtils.damp(smoothedLook.y, lookAt.y, 7, dt);
        smoothedLook.z = THREE.MathUtils.damp(smoothedLook.z, lookAt.z, 7, dt);
      }

      camera.lookAt(smoothedLook);
      return { camDesired, camTarget, smoothedLook };
    },

    /** Lets the cinematic camera hand control back without a jump. */
    syncCameraFrom(pos, look) {
      camera.position.copy(pos);
      smoothedLook.copy(look);
    },

    turnToward(targetHeading, dt, rate = 3.5) {
      let delta = targetHeading - heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      heading += delta * Math.min(1, rate * dt);
      return Math.abs(delta);
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      domElement.removeEventListener('click', onCanvasClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('contextmenu', onContextMenu);
    },
  };

  return api;
}
