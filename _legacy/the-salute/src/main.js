import './style.css';
import * as THREE from 'three';

import { createRenderer } from './core/renderer.js';
import { createSky } from './world/sky.js';
import { createGround } from './world/ground.js';
import { createSnow } from './world/snow.js';
import { createMountains } from './world/mountains.js';
import { createTrees } from './world/trees.js';
import { createFootprints } from './world/footprints.js';
import { createFlag } from './world/flag.js';
import { loadSoldier } from './player/soldier.js';
import { createControls } from './player/controls.js';
import { createAudio } from './audio/audio.js';
import { createUI } from './ui/ui.js';
import { POLE_POS, PATH_START, smoothstep } from './world/terrain.js';

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

const STATE = {
  TITLE: 'title',
  WALK: 'walk',
  ALIGN: 'align',
  HOIST: 'hoist',
  SALUTE: 'salute',
  EPILOGUE: 'epilogue',
};

const PROMPT_RANGE = 4.6;
const STAND_DISTANCE = 1.75; // where the soldier plants themself to hoist
const ALIGN_SECONDS = 1.2;
const HOIST_SECONDS = 5.6;
const SALUTE_HOLD = 5.0;

// The sun is held back during the walk so the climb still has somewhere to go.
const WALK_SUN_CEILING = 0.5;
const HOIST_SUN_TOP = 0.86;
const WALK_SUN_SECONDS = 110;

/* ------------------------------------------------------------------ */

const ui = createUI();
const canvas = document.getElementById('scene');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2500);

let gfx;
try {
  gfx = createRenderer(canvas, scene, camera);
} catch (err) {
  ui.fatal('This browser could not start WebGL. Try a recent Chrome, Edge, Firefox or Safari.');
  throw err;
}

const audio = createAudio();

/* ---------------------------- boot ---------------------------- */

const manager = new THREE.LoadingManager();
let modelProgress = 0;
manager.onProgress = (_url, loaded, total) => {
  modelProgress = total > 0 ? loaded / total : 0;
};

const world = {};

/**
 * Yield long enough for the progress bar to paint between the heavy build
 * steps. Races rAF against a timer: a backgrounded tab never fires rAF, and
 * without the timer the whole load would stall until the tab came forward.
 */
function yieldToPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 120);
  });
}

async function boot() {
  const steps = [
    ['Raising the mountains', () => (world.sky = createSky(scene, gfx.renderer))],
    ['Laying the snow', () => (world.ground = createGround(scene))],
    ['Carving the ridgeline', () => (world.mountains = createMountains(scene))],
    ['Planting the pines', () => (world.trees = createTrees(scene))],
    ['Letting it fall', () => (world.snow = createSnow(scene))],
    ['Setting the pole', () => (world.flag = createFlag(scene))],
    ['Marking the trail', () => (world.footprints = createFootprints(scene))],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [label, run] = steps[i];
    ui.setProgress((i / (steps.length + 3)) * 0.55, label);
    await yieldToPaint();
    run();
  }

  ui.setProgress(0.6, 'Calling the soldier');
  const modelTick = setInterval(() => {
    ui.setProgress(0.6 + modelProgress * 0.35, 'Calling the soldier');
  }, 100);

  world.soldier = await loadSoldier(manager);
  clearInterval(modelTick);
  scene.add(world.soldier.root);

  ui.setProgress(0.97, 'Listening for the wind');
  await audio.probeExternalTrack();

  world.controls = createControls(camera, canvas);
  world.soldier.root.position.copy(world.controls.position);
  syncSnowScale();

  // Warm up shaders on the real camera framing so the first frame is not a hitch.
  world.controls.update(0.016);
  world.sky.follow(world.controls.position);
  gfx.renderer.compile(scene, camera);
  gfx.render(0.016);

  ui.setProgress(1, 'Ready');
  await new Promise((r) => setTimeout(r, 320));
  ui.showTitle();
  gfx.setFade(1);
  armTitle();
}

/* ---------------------------- state ---------------------------- */

let state = STATE.TITLE;
let stateTime = 0;
let walkTime = 0;
let hoistT = 0;
let alignT = 0;
let saluteWeight = 0;
let hoistWeight = 0;
let poseTime = 0;
let boost = 0;
let fade = 1;
let captionStage = 0;
let started = false;
let hasWalked = false;
/** Dev only: pins one procedural pose at full weight so it can be tuned. */
let debugPose = null;
let camFreeze = null;

const startDistance = Math.hypot(PATH_START.x - POLE_POS.x, PATH_START.z - POLE_POS.z);

const TOUCH_ONLY = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

function armTitle() {
  if (TOUCH_ONLY) ui.setTitleCta('Tap to begin');

  const begin = (e) => {
    if (started) return;
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
    started = true;
    window.removeEventListener('keydown', begin);
    window.removeEventListener('pointerdown', begin);
    audio.start();
    ui.hideTitle();
    ui.setHint(true);
    setState(STATE.WALK);
    world.controls.setEnabled(true);
  };
  window.addEventListener('keydown', begin);
  window.addEventListener('pointerdown', begin);
}

function setState(next) {
  state = next;
  stateTime = 0;
}

/* ---------------------------- interaction ---------------------------- */

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
  if (e.code !== 'KeyE') return;
  if (state !== STATE.WALK) return;
  if (distanceToPole() > PROMPT_RANGE) return;
  beginHoist();
});

// Tapping the prompt works too, for touch.
document.getElementById('prompt').addEventListener('click', () => {
  if (state === STATE.WALK && distanceToPole() <= PROMPT_RANGE) beginHoist();
});

function distanceToPole() {
  const p = world.controls.position;
  return Math.hypot(p.x - POLE_POS.x, p.z - POLE_POS.z);
}

let alignFrom = new THREE.Vector3();
let alignTo = new THREE.Vector3();

function beginHoist() {
  world.controls.setLocked(true);
  ui.setPrompt(false);
  ui.setHint(false);

  // Plant the soldier on the near side of the pole, facing it.
  const p = world.controls.position;
  const dx = p.x - POLE_POS.x;
  const dz = p.z - POLE_POS.z;
  const len = Math.hypot(dx, dz) || 1;
  alignFrom.copy(p);
  alignTo.set(POLE_POS.x + (dx / len) * STAND_DISTANCE, 0, POLE_POS.z + (dz / len) * STAND_DISTANCE);

  alignT = 0;
  setState(STATE.ALIGN);
}

/* ---------------------------- cinematic camera ---------------------------- */

const cineTarget = new THREE.Vector3();
const cineLook = new THREE.Vector3();
const _v = new THREE.Vector3();

function isCinematicState() {
  return state === STATE.ALIGN || state === STATE.HOIST || state === STATE.SALUTE || state === STATE.EPILOGUE;
}

/**
 * Drives the camera through the hoist and salute. Positions are built from the
 * soldier and the pole so the framing holds wherever the player approached from.
 */
function updateCinematic(dt) {
  const p = world.controls.position;
  const flagY = world.flag.position.y + 1.55 + (world.flag.poleTopY - world.flag.position.y - 1.55) * hoistT;

  // Camera sits off the soldier's left, on the side the sun is not, so the
  // pole stays backlit through the whole sequence.
  const side = 1;

  if (state === STATE.ALIGN || (state === STATE.HOIST && stateTime < 2.4)) {
    // Side-on: the pull and the climbing flag both read.
    cineTarget.set(p.x + 4.3 * side, p.y + 2.0, p.z + 1.4);
    cineLook.set((p.x + POLE_POS.x) / 2, p.y + 1.9, (p.z + POLE_POS.z) / 2);
  } else if (state === STATE.HOIST) {
    // Crane up and back with the flag. Backing off matters as much as rising:
    // stay close and the pole runs straight out of the top of the frame.
    const k = smoothstep(2.4, HOIST_SECONDS, stateTime);
    cineTarget.set(p.x + (4.3 - 0.6 * k) * side, p.y + 2.0 + 2.7 * k, p.z + 1.4 + 4.3 * k);
    cineLook.set(POLE_POS.x, THREE.MathUtils.lerp(p.y + 1.9, flagY - 1.3, k), POLE_POS.z);
  } else if (state === STATE.SALUTE) {
    // Three-quarter rear, low: the salute in silhouette against the sunrise,
    // with the flag flying above. Then a slow push in over the hold.
    const k = smoothstep(0, 2.2, stateTime);
    const push = 1 - 0.16 * smoothstep(2.0, SALUTE_HOLD, stateTime);
    const ox = THREE.MathUtils.lerp(3.1, 2.3, k) * side * push;
    const oy = THREE.MathUtils.lerp(3.6, 1.32, k) * push;
    const oz = THREE.MathUtils.lerp(3.2, 3.9, k) * push;
    cineTarget.set(p.x + ox, p.y + oy, p.z + oz);
    cineLook.set(
      THREE.MathUtils.lerp(p.x, p.x * 0.65 + POLE_POS.x * 0.35, k),
      p.y + 1.62,
      THREE.MathUtils.lerp(p.z, p.z - 1.4, k)
    );
  } else {
    // Epilogue: ease back and up until the whole thing is in one frame —
    // soldier, flag, valley, sun.
    const k = smoothstep(0, 10, stateTime);
    cineTarget.set(p.x + 2.3 * side + 3.4 * k, p.y + 1.32 + 4.1 * k, p.z + 3.9 + 7.4 * k);
    cineLook.set(POLE_POS.x * 0.5 + p.x * 0.5, p.y + 1.62 + 2.9 * k, p.z - 1.4 - 1.6 * k);
  }

  // Never clip through a drift.
  const floor = world.ground ? Math.max(p.y, 0) : 0;
  if (cineTarget.y < floor + 0.7) cineTarget.y = floor + 0.7;

  const rate = state === STATE.EPILOGUE ? 1.1 : 2.0;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cineTarget.x, rate, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cineTarget.y, rate, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, cineTarget.z, rate, dt);

  _v.copy(cineLook);
  camera.lookAt(_v);
  world.controls.syncCameraFrom(camera.position, _v);
}

/* ---------------------------- sunrise timing ---------------------------- */

function sunProgress() {
  switch (state) {
    case STATE.TITLE:
      return 0;
    case STATE.WALK:
    case STATE.ALIGN: {
      const byTime = (walkTime / WALK_SUN_SECONDS) * WALK_SUN_CEILING;
      // Progress also tracks how far you have come, so the light is always
      // roughly where it should be when you reach the pole.
      const travelled = 1 - Math.min(1, distanceToPole() / startDistance);
      const byPlace = travelled * WALK_SUN_CEILING;
      // Never open at full night — start on the blue hour, with the first
      // light already sitting behind the ridge.
      return Math.min(WALK_SUN_CEILING, Math.max(0.09, byTime, byPlace));
    }
    case STATE.HOIST:
      return THREE.MathUtils.lerp(WALK_SUN_CEILING, HOIST_SUN_TOP, easeInOut(hoistT));
    case STATE.SALUTE:
      return THREE.MathUtils.lerp(HOIST_SUN_TOP, 1, smoothstep(0, 2.6, stateTime));
    default:
      return 1;
  }
}

const easeInOut = (t) => t * t * (3 - 2 * t);
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1));

/* ---------------------------- loop ---------------------------- */

const timer = new THREE.Timer();
let raf = 0;
let frames = 0;

function tick(timestamp) {
  raf = requestAnimationFrame(tick);
  frames++;
  timer.update(timestamp);
  // Clamped so a backgrounded tab does not fast-forward the whole sunrise the
  // moment it comes back to the front.
  const dt = Math.min(timer.getDelta(), 0.05);
  stateTime += dt;

  const { controls, soldier, flag, snow, sky, ground, mountains, footprints, trees } = world;

  /* --- state machine --- */

  switch (state) {
    case STATE.WALK: {
      walkTime += dt;
      if (controls.moving && !hasWalked) {
        hasWalked = true;
        audio.beginScore();
      }
      const d = distanceToPole();
      ui.setPrompt(d <= PROMPT_RANGE, 'Hoist the flag');
      if (walkTime > 12 && hasWalked) ui.setHint(false);
      break;
    }

    case STATE.ALIGN: {
      alignT = Math.min(1, alignT + dt / ALIGN_SECONDS);
      const k = easeInOut(alignT);
      controls.position.x = THREE.MathUtils.lerp(alignFrom.x, alignTo.x, k);
      controls.position.z = THREE.MathUtils.lerp(alignFrom.z, alignTo.z, k);
      controls.turnToward(Math.atan2(POLE_POS.x - controls.position.x, POLE_POS.z - controls.position.z), dt, 6);
      hoistWeight = THREE.MathUtils.damp(hoistWeight, 1, 3.5, dt);
      if (alignT >= 1) {
        hoistT = 0;
        setState(STATE.HOIST);
      }
      break;
    }

    case STATE.HOIST: {
      hoistWeight = THREE.MathUtils.damp(hoistWeight, 1, 4, dt);
      hoistT = Math.min(1, stateTime / HOIST_SECONDS);
      // Slack comes out slowly, the haul settles into a rhythm, the flag
      // arrives gently at the finial.
      flag.setHoist(easeInOutSine(hoistT));
      if (hoistT >= 1) {
        // The payoff beat: everything lands together.
        audio.swell();
        boost = 1;
        setState(STATE.SALUTE);
      }
      break;
    }

    case STATE.SALUTE: {
      hoistWeight = THREE.MathUtils.damp(hoistWeight, 0, 6, dt);
      saluteWeight = THREE.MathUtils.damp(saluteWeight, 1, 3.2, dt);
      if (stateTime > SALUTE_HOLD) {
        audio.settle();
        setState(STATE.EPILOGUE);
      }
      break;
    }

    case STATE.EPILOGUE: {
      saluteWeight = THREE.MathUtils.damp(saluteWeight, 1, 3, dt);
      if (captionStage === 0 && stateTime > 1.2) {
        ui.showCaption('For every soldier who did not come home.');
        captionStage = 1;
      } else if (captionStage === 1 && stateTime > 8.5) {
        ui.hideCaption();
        captionStage = 2;
      } else if (captionStage === 2 && stateTime > 10.5) {
        ui.showCaption('Jai Hind.');
        captionStage = 3;
      }
      break;
    }
  }

  /* --- player --- */

  // Soft collision so you cannot walk through the pole.
  if (state === STATE.WALK) {
    const dx = controls.position.x - POLE_POS.x;
    const dz = controls.position.z - POLE_POS.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.35 && d > 0.0001) {
      controls.position.x = POLE_POS.x + (dx / d) * 1.35;
      controls.position.z = POLE_POS.z + (dz / d) * 1.35;
    }
  }

  // Controls always run — they own the player transform. The camera goes to
  // whichever rig is in charge this frame.
  const cinematic = camFreeze != null || isCinematicState();
  controls.update(dt, !cinematic);
  if (camFreeze) {
    const p = controls.position;
    camera.position.set(p.x + camFreeze.off[0], p.y + camFreeze.off[1], p.z + camFreeze.off[2]);
    camera.lookAt(p.x, p.y + camFreeze.lookY, p.z);
  } else if (cinematic) {
    updateCinematic(dt);
  }

  soldier.root.position.copy(controls.position);
  soldier.root.rotation.y = controls.heading;

  const walking = state === STATE.WALK && controls.moving;
  soldier.setWalking(walking);
  soldier.setWalkSpeed(controls.speed);

  // poseTime runs continuously so the rope-pull cycle does not jump when the
  // state machine moves from ALIGN into HOIST.
  poseTime += dt;
  if (debugPose === 'salute') soldier.setSalute(1);
  else if (debugPose) soldier.setHoisting(1, debugPose === 'hoistHigh' ? Math.PI / 4.8 : -Math.PI / 4.8);
  else if (hoistWeight > 0.002) soldier.setHoisting(hoistWeight, poseTime);
  else if (saluteWeight > 0.002) soldier.setSalute(saluteWeight);
  else soldier.clearPose();

  soldier.update(dt);

  /* --- world --- */

  boost = Math.max(0, boost - dt * 0.42);
  const easedBoost = boost * boost;

  sky.setProgress(sunProgress(), easedBoost);
  sky.follow(controls.position);
  mountains.sync(sky.state);
  mountains.follow(controls.position);
  ground.setTint(sky.state.groundColor, sky.state.groundEmissive, sky.state.groundEmissiveI);
  snow.update(dt, controls.position);
  snow.setTint(sky.state.sunColor.clone().lerp(new THREE.Color(0xffffff), 0.72));
  footprints.update(dt, controls.position, controls.heading, walking);
  footprints.sync(sky.state);

  // Wind picks up nearer the pass, and the cloth answers it.
  const windIntensity = 0.4 + 0.6 * (1 - Math.min(1, distanceToPole() / startDistance));
  flag.update(dt, 0.85 + windIntensity * 0.5);
  flag.sync(sky.state);
  if (state === STATE.WALK) audio.setWindIntensity(windIntensity);

  gfx.sync(sky.state);

  /* --- opening fade --- */
  if (started && fade > 0) {
    fade = Math.max(0, fade - dt * 0.32);
    gfx.setFade(fade * fade);
  }

  gfx.render(dt);
}

if (import.meta.env.DEV) {
  // Tuning handle: __game.jump(0.85) to preview a point in the sunrise,
  // __game.skipTo('hoist') to jump straight to the payoff.
  window.__game = {
    world,
    gfx,
    camera,
    scene,
    audio,
    get state() {
      return state;
    },
    get fade() {
      return fade;
    },
    get debug() {
      return { state, stateTime, alignT, hoistT, hoistWeight, saluteWeight, walkTime, raf, frames };
    },
    jump(p) {
      walkTime = p * WALK_SUN_SECONDS;
      world.sky.setProgress(p, 0);
      return p;
    },
    skipTo(next) {
      if (next === 'hoist') {
        world.controls.position.set(POLE_POS.x, 0, POLE_POS.z + 3.2);
        walkTime = WALK_SUN_SECONDS;
        beginHoist();
      } else setState(next);
      return state;
    },
    clearFade() {
      fade = 0;
      gfx.setFade(0);
    },
    /** 'salute' | 'hoistHigh' | 'hoistLow' | null */
    forcePose(name) {
      debugPose = name;
      return name;
    },
    /** Park the camera on a fixed offset from the soldier for pose review. */
    freeCam(off = [2.6, 1.6, 3.2], lookY = 1.5) {
      const p = world.controls.position;
      camFreeze = { off, lookY };
      camera.position.set(p.x + off[0], p.y + off[1], p.z + off[2]);
      camera.lookAt(p.x, p.y + lookY, p.z);
    },
    releaseCam() {
      camFreeze = null;
    },
  };
}

/* ---------------------------- go ---------------------------- */

function syncSnowScale() {
  if (!world.snow) return;
  world.snow.onResize(gfx.renderer.getContext().drawingBufferHeight, camera.fov);
}

window.addEventListener('resize', () => {
  // gfx installs its own resize listener first, so camera.fov is already
  // updated for the new aspect by the time this runs.
  syncSnowScale();
});

// Note: no visibilitychange pause here on purpose. Browsers already throttle
// rAF in a hidden tab, and hand-rolling the pause means a single missed
// visibilitychange event leaves the experience frozen for good. The dt clamp
// in tick() is what actually protects against a large jump on return.

boot()
  .then(() => {
    tick(performance.now());
  })
  .catch((err) => {
    console.error(err);
    ui.fatal(err?.message ?? 'Something went wrong while loading the scene.');
  });
