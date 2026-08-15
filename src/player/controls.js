import * as THREE from 'three';

/**
 * Walking, and the third-person camera.
 *
 * Movement is body-relative and deliberately decoupled from the camera:
 *
 *   W / S, up / down     walk forward or back along the player's own facing
 *   A / D, left / right  turn the player
 *   drag                 orbit the camera, and nothing else
 *
 * Camera-relative movement was tried and removed: looking around silently
 * redefined which way "forward" was, so a drag sent the player somewhere they
 * had not asked to go.
 *
 * On touch, holding anywhere on the lower half of the screen walks forward and
 * sliding the thumb left or right steers, so the whole thing works one-handed
 * without putting a joystick over the scene.
 *
 * The camera keeps the player in the lower third of frame and always has the
 * flagpole somewhere in shot, which is what makes walking toward it feel like
 * approaching something rather than wandering.
 */

const WALK_SPEED = 2.35;
const TURN_RATE = 2.2;
const CAM_DISTANCE = 4.2;
const CAM_HEIGHT = 0.95;
const CAM_LOOK_HEIGHT = 1.42;

export function createControls(camera, domElement, { start = { x: 1.4, z: 12 }, ground = null, obstacles = [] } = {}) {
  const position = new THREE.Vector3(start.x, 0, start.z);
  let heading = Math.PI;
  let orbitYaw = 0;
  // Starts tilted slightly down onto the courtyard. On a portrait phone the
  // vertical field is widened to hold the horizontal view, and without this
  // the extra field is all paving.
  let orbitPitch = 0.16;
  let enabled = false;
  let locked = false;
  let speed = 0;
  let moving = false;

  const keys = new Set();
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };

  const onKeyDown = (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      keys.add(k);
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  };
  const onBlur = () => keys.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /* --- pointer ----------------------------------------------------------- */

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let touchWalk = 0;
  let touchSteer = 0;

  function onDown(e) {
    if (!enabled) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.pointerType === 'touch' && e.clientY > window.innerHeight * 0.45) touchWalk = 1;
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (touchWalk) {
      touchSteer = THREE.MathUtils.clamp(touchSteer + dx * 0.012, -1, 1);
    } else {
      orbitYaw -= dx * 0.005;
      orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * 0.003, -0.3, 0.66);
    }
  }
  function onUp() {
    dragging = false;
    touchWalk = 0;
    touchSteer = 0;
  }

  domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  /* --- camera ------------------------------------------------------------- */

  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const smoothedLook = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let camYaw = heading;
  let initialised = false;

  /** Keeps the player out of the furniture without a physics engine. */
  function resolve(x, z) {
    for (const o of obstacles) {
      if (o.r !== undefined) {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < o.r && d > 1e-5) {
          x = o.x + (dx / d) * o.r;
          z = o.z + (dz / d) * o.r;
        }
      } else {
        // Axis-aligned box: push out along the shallowest axis.
        const hx = o.w / 2;
        const hz = o.d / 2;
        const dx = x - o.x;
        const dz = z - o.z;
        if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
          if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = o.x + Math.sign(dx || 1) * hx;
          else z = o.z + Math.sign(dz || 1) * hz;
        }
      }
    }
    return [x, z];
  }

  return {
    position,
    get heading() {
      return heading;
    },
    get moving() {
      return moving;
    },
    get speed() {
      return speed;
    },
    get orbitYaw() {
      return orbitYaw;
    },

    setEnabled(v) {
      enabled = v;
      if (!v) keys.clear();
    },
    setLocked(v) {
      locked = v;
      if (v) keys.clear();
    },

    /** Turns the player to face a world point — used when they take the rope. */
    faceToward(x, z, dt, rate = 5) {
      const want = Math.atan2(x - position.x, z - position.z);
      let delta = want - heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      heading += delta * Math.min(1, rate * dt);
      return Math.abs(delta);
    },

    /** Slides the player to a mark without taking control away abruptly. */
    easeTo(x, z, dt, rate = 4) {
      position.x = THREE.MathUtils.damp(position.x, x, rate, dt);
      position.z = THREE.MathUtils.damp(position.z, z, rate, dt);
      return Math.hypot(position.x - x, position.z - z);
    },

    update(dt, driveCamera = true) {
      let ix = 0;
      let iz = 0;
      if (enabled && !locked) {
        if (keys.has('up')) iz += 1;
        if (keys.has('down')) iz -= 1;
        if (keys.has('left')) ix -= 1;
        if (keys.has('right')) ix += 1;
        if (touchWalk) {
          iz += 1;
          ix += touchSteer;
        }
      }

      if (ix !== 0) heading -= ix * TURN_RATE * dt;
      forward.set(Math.sin(heading), 0, Math.cos(heading));

      const target = iz !== 0 ? WALK_SPEED * (iz > 0 ? 1 : -0.45) : 0;
      speed = THREE.MathUtils.damp(speed, target, iz !== 0 ? 8 : 11, dt);
      moving = Math.abs(speed) > 0.06;

      let nx = position.x + forward.x * speed * dt;
      let nz = position.z + forward.z * speed * dt;
      [nx, nz] = resolve(nx, nz);

      // Stay inside the courtyard.
      const limit = 16.4;
      nx = THREE.MathUtils.clamp(nx, -limit, limit);
      nz = THREE.MathUtils.clamp(nz, -limit, limit);
      position.x = nx;
      position.z = nz;
      position.y = ground ? ground.heightAt(nx, nz) : 0;

      if (!driveCamera) return;

      const steer = heading + orbitYaw;
      let yawDelta = steer - camYaw;
      yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
      camYaw += yawDelta * Math.min(1, (dragging ? 20 : 4.2) * dt);

      camTarget.set(position.x, position.y + CAM_LOOK_HEIGHT, position.z);
      const horiz = CAM_DISTANCE * Math.cos(orbitPitch);
      desired.set(
        camTarget.x - Math.sin(camYaw) * horiz,
        camTarget.y + CAM_HEIGHT + CAM_DISTANCE * Math.sin(orbitPitch),
        camTarget.z - Math.cos(camYaw) * horiz
      );
      const floor = (ground ? ground.heightAt(desired.x, desired.z) : 0) + 0.85;
      if (desired.y < floor) desired.y = floor;

      if (!initialised) {
        camera.position.copy(desired);
        smoothedLook.copy(camTarget);
        initialised = true;
      } else {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, 6, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, 4.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desired.z, 6, dt);
        smoothedLook.lerp(camTarget, Math.min(1, 8 * dt));
      }
      camera.lookAt(smoothedLook);
    },

    syncCameraFrom(pos, look) {
      camera.position.copy(pos);
      smoothedLook.copy(look);
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
  };
}
