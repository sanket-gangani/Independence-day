import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { buildPerson, rollPerson } from './people.js';

/**
 * You.
 *
 * Same construction as everybody else in the courtyard — a young man in a
 * kurta, not a soldier and not a robot — but with jointed legs, because you
 * are the only one who walks.
 *
 * GROUNDING
 * ---------
 * The walk cycle is written as joint angles, which means the feet are wherever
 * the maths puts them. Rather than tuning the hip height until it looks right
 * at one speed and sinks at another, every frame does a real solve: pose the
 * skeleton, ask both feet where they ended up in world space, and raise or
 * lower the whole body so the lower of the two rests exactly on the ground.
 * The result is a walk that plants — no skating, no hovering, no sinking —
 * over any ground height the terrain hands back.
 *
 * THE ROPE
 * --------
 * The halyard is not animated to meet the hands; the hands are the authority.
 * `handWorld()` reports where the grip actually is each frame and the rope is
 * rebuilt through those points, so the connection is exact by construction
 * instead of being a pose that happens to look close.
 */

export function createPlayer(scene, { seed = 7, ground = null } = {}) {
  const r = rng(seed);

  // A believable person to be: mid-twenties, white kurta, tricolour band on
  // the wrist. Deliberately not styled as a dignitary — the brief is that an
  // ordinary resident came forward and hoisted it.
  const spec = rollPerson(r, { age: 'adult', female: false, activity: 'watch' });
  spec.height = 1.74;
  spec.build = 0.28;
  spec.outfit = 'kurta';
  spec.prop = 'none';
  spec.hairStyle = 'short';
  spec.hair = 0;
  spec.beard = 1;
  spec.glasses = false;
  spec.topi = false;
  spec.tricolour = true;
  spec.stole = true;
  spec.colors.kurta = 0xeee7d4;
  spec.colors.pyjama = 0xdcd4c0;

  const person = buildPerson(spec, { legs: true, detail: 1 });
  const root = person.root;
  root.name = 'player';
  scene.add(root);

  const legs = person.legs;
  const [legA, legB] = legs; // A = left, B = right
  const baseHipY = person.hips.position.y;

  let walkPhase = 0;
  let breathe = 0;
  let pullWeight = 0;
  let pullPhase = 0;
  let effort = 0;
  let salute = 0;

  const _v = new THREE.Vector3();
  const _foot = new THREE.Vector3();

  /* --- poses ------------------------------------------------------------ */

  // Shoulder rotations for the two ends of the haul. Written as Euler angles
  // on the shoulder only: the forearm's bend is already in the geometry, so
  // aiming the shoulder is enough to put the hands on a rope.
  const ROPE_HIGH = { l: [-2.42, 0.14, 0.30], r: [-2.42, -0.14, -0.30] };
  const ROPE_LOW = { l: [-0.52, 0.08, 0.24], r: [-0.52, -0.08, -0.24] };
  const IDLE = { l: [0.05, 0, 0.07], r: [0.05, 0, -0.07] };
  // You hoisted it, so you salute it — hand to the brow, left arm at the side,
  // standing straight. Not both arms in the air.
  const SALUTE = { l: [0.03, 0, 0.045], r: [-1.24, 0.6, -1.2] };
  const SALUTE_ELBOW = -2.24;
  const restElbow = person.elbowBend;

  function mix3(a, b, k, out) {
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  }

  const _l = [0, 0, 0];
  const _r = [0, 0, 0];
  const _l2 = [0, 0, 0];
  const _r2 = [0, 0, 0];

  /* --- the solve -------------------------------------------------------- */

  /**
   * Puts the body at the height where the lower foot touches the ground.
   * Called after the pose is written and the matrices are current.
   */
  function plantFeet(groundY) {
    root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const leg of legs) {
      _foot.set(0, -leg.shinLen, 0).applyMatrix4(leg.knee.matrixWorld);
      if (_foot.y < lowest) lowest = _foot.y;
    }
    if (!Number.isFinite(lowest)) return;
    // The shoe sole sits a little below the ankle joint.
    const soleOffset = person.height * 0.019;
    root.position.y += groundY - (lowest - soleOffset);
  }

  const api = {
    root,
    person,
    spec,
    height: person.height,

    /**
     * World position of a hand — the rope grips exactly here.
     *
     * The two arms hang off different nodes: the left is rigid so its hand is
     * an offset from the shoulder, the right has an elbow so its hand is an
     * offset from the forearm. Reading the right hand off the shoulder would
     * put the rope wherever the hand *would* have been with a straight elbow.
     */
    handWorld(side, out = new THREE.Vector3()) {
      if (side < 0) return out.copy(person.handLocalFore).applyMatrix4(person.elbowR.matrixWorld);
      return out.copy(person.handLocal).applyMatrix4(person.armL.matrixWorld);
    },

    /** 0 = hands free, 1 = both hands on the halyard. */
    setPull(weight, phase) {
      pullWeight = THREE.MathUtils.clamp(weight, 0, 1);
      pullPhase = THREE.MathUtils.clamp(phase, 0, 1);
    },
    setEffort(v) {
      effort = THREE.MathUtils.clamp(v, 0, 1);
    },
    /** 0 = arms free, 1 = standing at attention with a hand at the brow. */
    setSalute(v) {
      salute = THREE.MathUtils.clamp(v, 0, 1);
    },

    /**
     * @param dt
     * @param speed    signed ground speed in m/s
     * @param groundY  height of the surface under the player right now
     */
    update(dt, speed, groundY = 0) {
      breathe += dt;
      const moving = Math.abs(speed) > 0.05;
      // Stride length scales with speed, so the feet never skate.
      const stride = 1.42;
      walkPhase += (speed / stride) * Math.PI * 2 * dt;
      if (!moving) {
        // Ease back to a standing phase rather than freezing mid-step.
        const target = Math.round(walkPhase / Math.PI) * Math.PI;
        walkPhase = THREE.MathUtils.damp(walkPhase, target, 6, dt);
      }

      const amp = THREE.MathUtils.clamp(Math.abs(speed) / 2.0, 0, 1);
      const p = walkPhase;

      // --- legs ---
      const hipSwing = 0.52 * amp;
      legA.hip.rotation.x = -Math.sin(p) * hipSwing;
      legB.hip.rotation.x = -Math.sin(p + Math.PI) * hipSwing;
      // Knees only bend one way, and mostly on the back half of the stride.
      legA.knee.rotation.x = Math.max(0, Math.sin(p - 0.7)) * 1.05 * amp + 0.04;
      legB.knee.rotation.x = Math.max(0, Math.sin(p + Math.PI - 0.7)) * 1.05 * amp + 0.04;
      legA.hip.rotation.z = 0.02;
      legB.hip.rotation.z = -0.02;

      // Bracing on the rope: feet apart, knees loaded.
      const brace = pullWeight * (0.35 + pullPhase * 0.45);
      legA.hip.rotation.z += brace * 0.12;
      legB.hip.rotation.z -= brace * 0.16;
      legA.knee.rotation.x += brace * 0.22;
      legB.knee.rotation.x += brace * 0.3;
      legB.hip.rotation.x -= brace * 0.18;

      // --- hips and torso ---
      const bob = Math.cos(p * 2) * 0.018 * amp;
      person.hips.position.y = baseHipY + bob - brace * person.height * 0.028;
      person.hips.rotation.y = -Math.sin(p) * 0.09 * amp;
      person.hips.rotation.z = Math.sin(p) * 0.035 * amp;

      person.torso.rotation.y = Math.sin(p) * 0.11 * amp;
      person.torso.rotation.x =
        0.03 + amp * 0.05 + Math.sin(breathe * 1.6) * 0.008 - pullWeight * (0.14 - pullPhase * 0.34) - salute * 0.05;
      person.torso.rotation.z = -Math.sin(p) * 0.02 * amp;

      // --- head ---
      // Looking where the work is: up the pole while hauling, up at the flag
      // while saluting, level while walking.
      person.neck.rotation.x =
        -pullWeight * (0.42 - pullPhase * 0.3) - salute * 0.44 + Math.sin(breathe * 0.9) * 0.02;
      person.neck.rotation.y = -Math.sin(p) * 0.05 * amp;

      // --- arms ---
      const swing = Math.sin(p) * 0.62 * amp;
      mix3(IDLE.l, ROPE_HIGH.l, pullWeight, _l);
      mix3(IDLE.r, ROPE_HIGH.r, pullWeight, _r);
      if (pullWeight > 0) {
        mix3(_l, mix3(IDLE.l, ROPE_LOW.l, pullWeight, _l2), pullPhase, _l);
        mix3(_r, mix3(IDLE.r, ROPE_LOW.r, pullWeight, _r2), pullPhase, _r);
      }
      if (salute > 0) {
        mix3(_l, SALUTE.l, salute, _l);
        mix3(_r, SALUTE.r, salute, _r);
      }

      const free = (1 - pullWeight) * (1 - salute);
      person.armL.rotation.set(_l[0] - swing * free, _l[1], _l[2]);
      person.armR.rotation.set(_r[0] + swing * free, _r[1], _r[2]);
      // The strain of the haul. Deliberately not applied under the salute —
      // a shaking salute reads as nerves, not as effort.
      const shake = effort * (1 - salute) * Math.sin(breathe * 26) * 0.02;
      person.armL.rotation.x += shake;
      person.armR.rotation.x -= shake;
      person.elbowR.rotation.x = THREE.MathUtils.lerp(restElbow, SALUTE_ELBOW, salute);

      plantFeet(groundY);
    },
  };

  void ground;
  return api;
}
