import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The soldier.
 *
 * The model ships with Idle / Walk / Run only, so the salute and the
 * rope-pull are built as a procedural pose layer: after the AnimationMixer has
 * written its result, we slerp selected bones toward a target built from their
 * bind-pose rotation times a hand-tuned local delta. Blending in after the
 * mixer means the body keeps breathing underneath while the arms do their job.
 *
 * Bone lookups strip the ':' because three's GLTFLoader sanitises node names,
 * turning 'mixamorig:RightArm' into 'mixamorigRightArm'.
 */

const MODEL_URL = 'models/Soldier.glb';

// The model's own forward axis, corrected so heading 0 faces +Z.
const MODEL_YAW = Math.PI;

const deg = THREE.MathUtils.degToRad;

/**
 * Every bone on this rig points down its own local +Y, so a pose is most
 * naturally written as "where should this bone point", not as an Euler delta
 * off the bind pose. Directions below are in the character's own frame:
 *
 *     +Z forward   +Y up   +X the character's LEFT   -X their RIGHT
 *
 * Each entry is [dirX, dirY, dirZ, twistDegrees]; the twist rolls the bone
 * about its own axis, which is what orients a flat saluting hand.
 */
const POSES = {
  // Right hand to the brow: upper arm out and a little forward, elbow high,
  // forearm angled up and in, hand flat against the temple.
  salute: {
    chains: [
      [
        ['RightArm', -0.87, -0.06, 0.44, 0],
        ['RightForeArm', 0.5, 0.82, 0.24, 0],
        ['RightHand', 0.6, 0.72, 0.32, -24],
      ],
      // Left arm straight down at the side, at attention.
      [
        ['LeftArm', 0.13, -0.985, 0.06, 0],
        ['LeftForeArm', 0.07, -0.99, 0.1, 0],
        ['LeftHand', 0.04, -0.99, 0.12, 0],
      ],
    ],
    euler: {
      Spine: [-1.5, 0, 0],
      Spine1: [-1.5, 0, 0],
      Neck: [-2, 0, 0],
      Head: [1.5, 0, 0],
    },
  },

  // Both hands high on the halyard, about to haul down.
  hoistHigh: {
    chains: [
      [
        ['RightArm', -0.26, 0.9, 0.35, 0],
        ['RightForeArm', 0.1, 0.95, 0.29, 0],
        ['RightHand', 0.06, 0.96, 0.27, 0],
      ],
      [
        ['LeftArm', 0.26, 0.86, 0.44, 0],
        ['LeftForeArm', -0.08, 0.93, 0.36, 0],
        ['LeftHand', -0.05, 0.95, 0.31, 0],
      ],
    ],
    euler: {
      Spine: [-4, 0, 0],
      Spine1: [-3, 0, 0],
      Neck: [-9, 0, 0],
      Head: [-7, 0, 0],
    },
  },

  // Hands drawn down past the chest at the bottom of the stroke.
  hoistLow: {
    chains: [
      [
        ['RightArm', -0.3, -0.66, 0.69, 0],
        ['RightForeArm', 0.14, 0.05, 0.99, 0],
        ['RightHand', 0.1, 0.02, 0.99, 0],
      ],
      [
        ['LeftArm', 0.3, -0.72, 0.62, 0],
        ['LeftForeArm', -0.12, -0.02, 0.99, 0],
        ['LeftHand', -0.08, -0.04, 0.99, 0],
      ],
    ],
    euler: {
      Spine: [2.5, 0, 0],
      Spine1: [2, 0, 0],
      Neck: [-4, 0, 0],
      Head: [-3, 0, 0],
    },
  },
};

export function loadSoldier(manager) {
  const loader = new GLTFLoader(manager);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        try {
          resolve(build(gltf));
        } catch (err) {
          reject(err);
        }
      },
      undefined,
      (err) => reject(new Error(`Could not load ${MODEL_URL}: ${err?.message ?? err}`))
    );
  });
}

function build(gltf) {
  const model = gltf.scene;
  model.rotation.y = MODEL_YAW;

  const root = new THREE.Group();
  root.name = 'soldier';
  root.add(model);

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material) {
        o.material.roughness = Math.min(1, (o.material.roughness ?? 0.8) * 1.05);
        o.material.metalness = Math.min(1, o.material.metalness ?? 0);
      }
    }
  });

  // --- bones --------------------------------------------------------------

  const bones = new Map();
  model.traverse((o) => {
    if (o.isBone) bones.set(o.name.replace(/^mixamorig:?/i, ''), o);
  });

  // Bind-pose local rotations, captured before the mixer touches anything.
  const rest = new Map();
  for (const [key, bone] of bones) rest.set(key, bone.quaternion.clone());

  // Resolve pose definitions into bone references once.
  const compiled = {};
  for (const [name, pose] of Object.entries(POSES)) {
    compiled[name] = {
      chains: (pose.chains ?? [])
        .map((chain) =>
          chain
            .map(([key, x, y, z, twist]) => {
              const bone = bones.get(key);
              return bone ? { key, bone, dir: new THREE.Vector3(x, y, z).normalize(), twist: deg(twist || 0) } : null;
            })
            .filter(Boolean)
        )
        .filter((chain) => chain.length > 0),
      euler: Object.entries(pose.euler ?? [])
        .map(([key, [rx, ry, rz]]) => {
          const bone = bones.get(key);
          if (!bone) return null;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(rx), deg(ry), deg(rz)));
          return { bone, target: rest.get(key).clone().multiply(q) };
        })
        .filter(Boolean),
    };
  }

  // --- animation ----------------------------------------------------------

  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name] = clip;

  const actions = {};
  for (const name of ['Idle', 'Walk', 'Run']) {
    if (!clips[name]) continue;
    const action = mixer.clipAction(clips[name]);
    action.enabled = true;
    action.setEffectiveWeight(name === 'Idle' ? 1 : 0);
    action.play();
    actions[name] = action;
  }
  if (!actions.Idle || !actions.Walk) {
    throw new Error('Soldier.glb is missing the Idle or Walk clip.');
  }

  let current = 'Idle';

  function crossFade(next, duration = 0.32) {
    if (next === current || !actions[next]) return;
    const from = actions[current];
    const to = actions[next];
    to.enabled = true;
    to.setEffectiveTimeScale(1);
    to.setEffectiveWeight(1);
    to.time = 0;
    from.crossFadeTo(to, duration, true);
    current = next;
  }

  // --- procedural pose layer ---------------------------------------------

  /** name -> weight, 0..1. Applied in order after the mixer runs. */
  const layer = { salute: 0, hoistHigh: 0, hoistLow: 0 };

  const BONE_AXIS = new THREE.Vector3(0, 1, 0);
  const _worldQ = new THREE.Quaternion();
  const _parentQ = new THREE.Quaternion();
  const _localDir = new THREE.Vector3();
  const _solved = new THREE.Quaternion();
  const _twistQ = new THREE.Quaternion();
  const _rootQ = new THREE.Quaternion();

  /**
   * Point each bone in a chain along its target direction.
   *
   * Walks parent to child, carrying the running world rotation forward as it
   * goes. That matters: once the shoulder has been re-aimed, the elbow's own
   * target has to be resolved against the *new* shoulder orientation, not the
   * one the mixer left behind.
   */
  function solveChain(chain, weight) {
    const first = chain[0].bone;
    first.parent.getWorldQuaternion(_parentQ);
    _worldQ.copy(_parentQ);

    for (const { bone, dir, twist } of chain) {
      // Target direction: character frame -> world -> this bone's parent frame.
      _localDir.copy(dir).applyQuaternion(_rootQ);
      _parentQ.copy(_worldQ).invert();
      _localDir.applyQuaternion(_parentQ).normalize();

      _solved.setFromUnitVectors(BONE_AXIS, _localDir);
      if (twist !== 0) _solved.multiply(_twistQ.setFromAxisAngle(BONE_AXIS, twist));

      bone.quaternion.slerp(_solved, weight);
      // Carry the blended result forward for the next joint down.
      _worldQ.multiply(bone.quaternion);
    }
  }

  function applyLayer() {
    root.getWorldQuaternion(_rootQ);

    for (const name of ['hoistHigh', 'hoistLow', 'salute']) {
      const w = layer[name];
      if (w <= 0.0005) continue;
      const pose = compiled[name];
      for (const { bone, target } of pose.euler) bone.quaternion.slerp(target, w);
      for (const chain of pose.chains) solveChain(chain, w);
    }
  }

  const api = {
    root,
    model,
    mixer,
    actions,
    bones,

    get animation() {
      return current;
    },

    setWalking(walking) {
      crossFade(walking ? 'Walk' : 'Idle', walking ? 0.25 : 0.4);
    },

    /**
     * Matches stride length to ground speed so the boots stop sliding.
     * Signed — backing up runs the walk cycle in reverse.
     */
    setWalkSpeed(metresPerSecond) {
      if (!actions.Walk) return;
      const sign = metresPerSecond < 0 ? -1 : 1;
      const rate = THREE.MathUtils.clamp(Math.abs(metresPerSecond) / 1.45, 0.5, 1.8);
      actions.Walk.setEffectiveTimeScale(rate * sign);
    },

    /**
     * Rope-pull cycle. `t` counts seconds; the arms reach up and haul down on
     * a smooth loop, weighted in and out by `weight`.
     */
    setHoisting(weight, t) {
      const phase = (Math.sin(t * 2.4) + 1) / 2; // 0 = low, 1 = high
      layer.hoistHigh = weight * phase;
      layer.hoistLow = weight * (1 - phase);
      layer.salute = 0;
    },

    setSalute(weight) {
      layer.salute = weight;
      layer.hoistHigh = 0;
      layer.hoistLow = 0;
    },

    clearPose() {
      layer.salute = layer.hoistHigh = layer.hoistLow = 0;
    },

    update(dt) {
      mixer.update(dt);

      // Overriding after the mixer is the whole trick: the mixer writes the
      // walk/idle result, then we bend the arms on top of it. The solver reads
      // world rotations, so the matrices have to be current first.
      if (layer.salute > 0.0005 || layer.hoistHigh > 0.0005 || layer.hoistLow > 0.0005) {
        root.updateMatrixWorld(true);
        applyLayer();
      }
      root.updateMatrixWorld(true);
    },
  };

  if (import.meta.env.DEV) {
    // Live pose tuning from the console:
    //   __soldier.aim('salute', 'RightForeArm', [0.44, 0.84, 0.32], 0)
    //   __soldier.dump()
    window.__soldier = {
      api,
      poses: POSES,
      bones: [...bones.keys()],
      aim(poseName, boneKey, dir, twistDeg = 0) {
        for (const chain of compiled[poseName].chains) {
          const link = chain.find((l) => l.key === boneKey);
          if (!link) continue;
          link.dir.set(dir[0], dir[1], dir[2]).normalize();
          link.twist = deg(twistDeg);
          for (const row of POSES[poseName].chains.flat()) {
            if (row[0] === boneKey) {
              row[1] = dir[0];
              row[2] = dir[1];
              row[3] = dir[2];
              row[4] = twistDeg;
            }
          }
          return link.dir.toArray();
        }
        return `no bone ${boneKey} in ${poseName}`;
      },
      dump: () => JSON.stringify(POSES, null, 1),
    };
  }

  return api;
}
