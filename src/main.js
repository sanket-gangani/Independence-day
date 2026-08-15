import './style.css';
import * as THREE from 'three';
import { inject, track } from '@vercel/analytics';

import { createRenderer } from './core/renderer.js';
import { detectQuality } from './core/quality.js';
import { isTyping } from './core/keys.js';
import { createSky } from './world/sky.js';
import { createPlaza } from './world/plaza.js';
import { createSociety } from './world/society.js';
import { createCeremony } from './world/ceremony.js';
import { createFlag } from './world/flag.js';
import { createPetals } from './world/petals.js';
import { createCrowd } from './world/crowd.js';
import { createPlayer } from './world/player.js';
import { createControls } from './player/controls.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { makePoster, captureCanvas } from './share/poster.js';
import { captureMoment, placeHint, shareMessage, shareUrl } from './share/moment.js';

/* ------------------------------------------------------------------ */

const REACH = 3.2; // how close before the rope can be taken

/**
 * How long the flag takes to reach the top, in one continuous haul.
 *
 * This used to be six discrete pump strokes. It looked like someone working a
 * hand pump, and it made the player press a button over and over for something
 * they had already decided to do. A real hoist at a society function is one
 * long steady pull, so that is what this is now: take the rope, and it goes up.
 */
const HOIST_TIME = 3.1;

// Counted before anything is built, so a browser that cannot start WebGL at all
// still shows up as a visit rather than vanishing.
inject();

const ui = createUI();
const canvas = document.getElementById('scene');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);

// Decided once, before anything is built, because it changes how much gets
// built rather than just how it is drawn.
const quality = detectQuality();

let gfx;
try {
  gfx = createRenderer(canvas, scene, camera, quality);
} catch (err) {
  ui.fatal('This browser could not start WebGL. Try a recent Chrome, Safari or Firefox.');
  throw err;
}

const world = {};

/* ---------------------------- state ---------------------------- */

const STATE = {
  LOADING: 'loading',
  TITLE: 'title',
  WALK: 'walk',
  GRAB: 'grab',
  HAUL: 'haul',
  TOP: 'top',
  UNFURL: 'unfurl',
  CELEBRATE: 'celebrate',
};

let state = STATE.LOADING;
let stateTime = 0;
let elapsed = 0;

let hoist = 0;
let hoistShown = 0;
let open = 0;
let gripWeight = 0;
let pullPhase = 0; // 0 = hands high on the rope, 1 = hauled all the way down
let haulTime = -1; // < 0 = not hauling yet
let salute = 0;
let cine = 0; // 0 gameplay camera, 1 cinematic
let playerName = '';
let playerPlace = '';
/** Stamped the instant the flag reaches the top — real clock, real date. */
let moment = null;
let flowersFired = false;
let confettiFired = false;
let celebrateShown = false;

const ROPE_MARK = new THREE.Vector3();
const POLE = new THREE.Vector3(0, 0, 0);
const _grip = new THREE.Vector3();

/* ---------------------------- boot ---------------------------- */

function yieldToPaint(label) {
  if (label) ui.loadingStep(label);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 220);
  });
}

async function boot() {
  await yieldToPaint('the sun is coming up');
  world.sky = createSky(scene, gfx.renderer, quality);

  await yieldToPaint('laying the paving');
  world.plaza = createPlaza(scene);

  await yieldToPaint('building the society');
  world.society = createSociety(scene);

  await yieldToPaint('setting out the chairs');
  world.ceremony = createCeremony(scene);

  await yieldToPaint('rolling the tricolour');
  world.flag = createFlag(scene);
  world.petals = createPetals(scene);

  await yieldToPaint('the neighbours are arriving');
  world.crowd = createCrowd(scene, { ground: world.plaza, count: quality.crowd });

  await yieldToPaint('almost there');
  world.player = createPlayer(scene, { ground: world.plaza });

  // Where you have to stand to reach the rope, pushed out a little from the
  // pole so the player is not standing inside it.
  ROPE_MARK.copy(world.flag.ropeSpot).multiplyScalar(1.25);
  ROPE_MARK.y = 0;

  world.controls = createControls(camera, canvas, {
    start: { x: 1.9, z: 8.6 },
    ground: world.plaza,
    obstacles: [
      { x: 0, z: 0, r: 1.5 }, // the flagpole and its plinth
      { x: 0, z: -6.6, w: 4.4, d: 2.0 }, // the table
      { x: -4.9, z: -6.0, r: 0.8 }, // speaker stands
      { x: 4.9, z: -6.0, r: 0.8 },
      { x: -4.1, z: -8.1, r: 0.6 }, // banner poles
      { x: 4.1, z: -8.1, r: 0.6 },
      { x: -2.1, z: -5.6, r: 0.5 }, // mic stand
    ],
  });
  world.player.root.position.copy(world.controls.position);

  world.sky.setProgress(0.12);
  syncParticleScale();

  // Audit the crowd before anything is shown: this is the check that keeps the
  // "nobody floats" promise honest rather than aspirational.
  if (import.meta.env.DEV) {
    const bad = world.crowd.audit();
    console.log(
      `[boot] ${world.crowd.count} people placed, ${bad.length} off the ground`,
      bad.length ? bad : ''
    );
  }

  await yieldToPaint('warming up the shaders');
  gfx.renderer.compile(scene, camera);

  world.audio = createAudio();
  // Only probes whether a licensed track has been dropped in; makes no sound
  // until the player's first click.
  world.audio.probe();

  ui.setPlacePlaceholder(placeHint() || 'Bengaluru');
  ui.show('title');
  state = STATE.TITLE;
}

function syncParticleScale() {
  world.petals?.onResize(gfx.renderer.getContext().drawingBufferHeight, camera.fov);
}
window.addEventListener('resize', syncParticleScale);

/* ---------------------------- flow ---------------------------- */

ui.on('btn-begin', () => {
  playerName = ui.nameValue;
  playerPlace = ui.placeValue;
  ui.setPlayerLine(playerName, playerPlace);
  ui.setCelebrateTitle(playerName);
  state = STATE.WALK;
  stateTime = 0;
  ui.show('hud');
  world.controls.setEnabled(true);
  // The click that starts the game is also the gesture that lets audio play.
  world.audio.start();
  ui.showSound(true);
  ui.setMuted(world.audio.muted);
});

ui.on('btn-share', share);
ui.on('btn-poster-close', () => ui.show('celebrate'));
ui.on('btn-again', hoistAgain);
ui.on('btn-share-link', shareLink);
ui.on('btn-sound', () => ui.setMuted(world.audio.toggleMute()));
ui.onPress('prompt', () => pull());

/**
 * Puts the courtyard back to the moment before the hoist.
 *
 * The only way to do this used to be a page reload, which meant waiting out
 * the loader and typing your name again to watch a thirty-second ceremony.
 * Nothing here needs rebuilding — the scene, the crowd and the flag are all
 * still standing — so this winds the run's own state back and hands control
 * over, and the name and place are kept because they are still true.
 *
 * The poster is dropped rather than kept: it is a photograph of a specific
 * hoist at a specific minute, and the next one gets its own.
 */
function hoistAgain() {
  state = STATE.WALK;
  stateTime = 0;

  hoist = 0;
  hoistShown = 0;
  open = 0;
  gripWeight = 0;
  pullPhase = 0;
  haulTime = -1;
  salute = 0;
  cine = 0;

  moment = null;
  flowersFired = false;
  confettiFired = false;
  celebrateShown = false;
  posterCanvas = null;
  posterUrl = null;
  heroShot = null;

  world.flag.setHoist(0);
  world.flag.setOpen(0);
  world.crowd.setReaction(0);
  world.crowd.setHoist(0);
  world.petals.clear();

  world.controls.reset();
  world.controls.setLocked(false);
  world.controls.setEnabled(true);

  ui.setHoist(false, 0);
  ui.setPrompt(false);
  ui.show('hud');
}

function distanceToRope() {
  const p = world.controls.position;
  return Math.hypot(p.x - ROPE_MARK.x, p.z - ROPE_MARK.z);
}

/* ---------------------------- the pull ---------------------------- */

/** Step 2 of the sequence: the player reaches out and takes the rope. */
function grabRope() {
  if (state !== STATE.WALK) return;
  state = STATE.GRAB;
  stateTime = 0;
  cine = 1;
  world.controls.setEnabled(false);
  world.controls.setLocked(true);
  ui.setPrompt(false);
  ui.setHoist(true, 0);
}

/**
 * Steps 3 and 4: take the rope, and the flag goes up.
 *
 * One action, one motion. Taking the rope starts a single continuous haul that
 * runs to the top on its own — there is nothing to press repeatedly, and the
 * character never resets their grip for another bite.
 */
function pull() {
  if (state === STATE.WALK && distanceToRope() <= REACH) grabRope();
}

// E, space or enter all take the rope — but not while somebody is typing
// their name, and not before they have stepped into the courtyard. This
// listener used to swallow E and space everywhere on the page.
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  if (state === STATE.LOADING || state === STATE.TITLE) return;
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    pull();
  }
});

// Enter in either title field starts the ceremony, which is what pressing
// Enter in a form is for.
for (const id of ['input-name', 'input-place']) {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
      document.getElementById('btn-begin').click();
    }
  });
}

// Tapping the scene near the rope takes it, so a phone player never has to
// find the button.
canvas.addEventListener('pointerdown', () => {
  if (state === STATE.WALK && distanceToRope() <= REACH) grabRope();
});

/**
 * Advances the haul.
 *
 * `pullPhase` drives the character's arms from high on the rope down past the
 * chest, and the flag is locked to the same curve, so the tricolour is always
 * exactly as far up the mast as the hands are down. Eased at both ends: the
 * rope takes up slack before it bites, and the flag settles at the top rather
 * than slamming into the pulley.
 */
function updateHaul(dt) {
  if (haulTime < 0) return;
  haulTime += dt;
  const k = THREE.MathUtils.clamp(haulTime / HOIST_TIME, 0, 1);
  pullPhase = k * k * (3 - 2 * k);
  if (k >= 1 && state === STATE.HAUL) {
    state = STATE.TOP;
    stateTime = 0;
  }
}

/* ---------------------------- camera ---------------------------- */

const cinePos = new THREE.Vector3();
const cineLook = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function updateCinematicCamera(dt) {
  const p = world.controls.position;

  if (state === STATE.GRAB || state === STATE.HAUL || state === STATE.TOP) {
    // The composition the whole interaction depends on: you, the rope in your
    // hands, and the flag climbing the pole, all in one frame.
    //
    // The camera sits on the far side of the pole from the player and roughly
    // square to the flag's fly direction. That does two jobs at once: it stops
    // the player standing in front of the pole and hiding the bundle, and it
    // puts the tricolour close to face-on so the chakra is readable the moment
    // it opens. It also eases back and tilts up as the flag climbs, so nothing
    // crops out at the top of the hoist.
    //
    // It is close at the start, so the haul is physical and you are the
    // subject, and wide by the top, because by then the frame has to hold
    // eleven metres of pole, three of flag, and the person who put it there.
    const k = hoistShown;
    _a.set(2.95, 1.72, 3.75);
    _b.set(8.4, 3.6, 11.2);
    cinePos.lerpVectors(_a, _b, k);
    cineLook.set(-0.35 + k * 1.25, THREE.MathUtils.lerp(1.85, 5.2, k), 0.32);
  } else if (state === STATE.UNFURL) {
    // The flag is the hero. Tilt up with it against the morning sky.
    const k = THREE.MathUtils.clamp(stateTime / 2.6, 0, 1);
    const e = k * k * (3 - 2 * k);
    cinePos.set(8.4 - e * 0.8, 3.6 + e * 0.6, 11.2 - e * 1.0);
    cineLook.set(0.9 + e * 0.7, 5.2 + e * 3.2, 0.2);
  } else {
    // Hero shot: a slow arc across the front of the ceremony that takes in the
    // player, the open flag, the crowd, the buildings and the morning sky, and
    // then settles rather than continuing to drift.
    const k = THREE.MathUtils.clamp(stateTime / 13, 0, 1);
    const e = k * k * (3 - 2 * k);
    const a = 0.6 - e * 1.36;
    const rad = 13.0 + e * 1.4;
    cinePos.set(Math.sin(a) * rad, 2.9 + e * 1.2, Math.cos(a) * rad);
    // Aimed high enough that the fly corner of the flag stays inside the
    // frustum: the flag's top corner sits about 20° above this axis, and the
    // half-angle of the vertical field is 25°.
    cineLook.set(0.5 + p.x * 0.16, 6.1 + e * 0.4, -0.2);
  }

  const rate = state === STATE.GRAB ? 1.6 : 2.0;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cinePos.x, rate, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cinePos.y, rate, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, cinePos.z, rate, dt);
  camera.lookAt(cineLook);
  world.controls.syncCameraFrom(camera.position, cineLook);
}

/* ---------------------------- share ---------------------------- */

let posterCanvas = null;
let posterUrl = null;
/** The frame the ceremony ended on, kept from before the player took over. */
let heroShot = null;

async function share() {
  ui.show('poster');
  // Wait for a painted frame, but never longer than a moment: a tab that is
  // not being composited stops delivering animation frames altogether, and a
  // share button that hangs forever is worse than one that grabs the last
  // frame that was drawn.
  await new Promise((r) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 250);
  });
  // The kept frame if there is one, and only otherwise whatever is on screen
  // now — which is the right fallback for a capture that failed rather than a
  // reason to photograph a wall.
  const sceneImage = (await heroShot) || (await captureCanvas(canvas));
  posterCanvas = makePoster({ sceneImage, name: playerName, moment });
  posterUrl = posterCanvas.toDataURL('image/jpeg', 0.92);
  ui.setPoster(posterUrl);

}

/**
 * Sends the invitation: the message and the link, and nothing else.
 *
 * This is now the only way anything leaves the page. Sharing the poster as a
 * file is gone, and with it the whole class of bugs that came from putting an
 * attachment in a share payload — WhatsApp's target takes one kind of thing,
 * and a file plus a link is two. The picture still travels, as the link's own
 * preview card, which is served from static og: tags and needs nothing of the
 * share sheet.
 *
 * The url is embedded in `text` rather than passed as `navigator.share({url})`
 * for that same reason: passing both produces a string *and* a URL item, which
 * is two things again.
 *
 * The button is ALWAYS shown. Most desktop browsers have no share sheet at
 * all, and hiding the control there just leaves someone hunting for it; on
 * those, this copies the message instead and says so.
 */
async function shareLink() {
  const url = shareUrl();
  const text = shareMessage(moment, playerName, url);

  try {
    if (navigator.share) {
      await navigator.share({ title: 'I hoisted the flag 🇮🇳', text });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('link share failed', err);
  }

  // No share sheet: put it on the clipboard, which is the next most useful
  // thing and is what a desktop user wants anyway.
  try {
    await navigator.clipboard.writeText(text);
    ui.flash('share-link-label', 'Copied — paste it anywhere');
    return;
  } catch {
    /* clipboard blocked; fall through */
  }
  ui.flash('share-link-label', 'Could not open sharing');
}

/* ---------------------------- loop ---------------------------- */

const timer = new THREE.Timer();

function tick(timestamp) {
  requestAnimationFrame(tick);
  timer.update(timestamp);
  frame(Math.min(timer.getDelta(), 0.05));
}

/**
 * One step of the world, with the timestep passed in rather than measured.
 *
 * Separating this from the rAF callback is what makes the sequence testable:
 * `__game.advance(seconds)` can run it at a fixed rate and step through the
 * whole hoist deterministically, which matters because a browser tab that is
 * not being composited stops delivering animation frames entirely.
 */
function frame(dt) {
  stateTime += dt;
  elapsed += dt;

  const { controls, player, flag, petals, crowd, sky, plaza, ceremony } = world;
  if (!controls) return;

  // Walking is the only state that offers the prompt. Clearing it here, rather
  // than only on grab, means no path out of WALK can leave it stuck on screen.
  if (state !== STATE.WALK) ui.setPrompt(false);

  /* --- state machine --- */
  switch (state) {
    case STATE.WALK: {
      const near = distanceToRope() <= REACH;
      ui.setPrompt(near, 'Pull the rope');
      break;
    }

    case STATE.GRAB: {
      controls.easeTo(ROPE_MARK.x, ROPE_MARK.z, dt, 3.4);
      controls.faceToward(POLE.x, POLE.z, dt, 4.5);
      gripWeight = THREE.MathUtils.damp(gripWeight, 1, 3.6, dt);
      if (stateTime > 1.05) {
        state = STATE.HAUL;
        stateTime = 0;
        // Taking the rope *is* the decision to hoist, so the haul starts here
        // and runs to the top by itself. There is no button to press again.
        haulTime = 0;
              world.audio?.rope();
      }
      break;
    }

    case STATE.HAUL: {
      controls.easeTo(ROPE_MARK.x, ROPE_MARK.z, dt, 4);
      controls.faceToward(POLE.x, POLE.z, dt, 5);
      gripWeight = THREE.MathUtils.damp(gripWeight, 1, 5, dt);
      updateHaul(dt);
      break;
    }

    case STATE.TOP: {
      // The flag is at the top: this is the instant worth recording.
      if (!moment) {
        moment = captureMoment(playerPlace);
        // Pageviews say how many people opened the link; this says how many
        // actually got the tricolour up. No properties are attached — the name
        // and place are the player's, and they stay on their machine.
        track('hoist');
      }
      gripWeight = THREE.MathUtils.damp(gripWeight, stateTime > 0.7 ? 0 : 1, 4, dt);
          if (stateTime > 1.15) {
        state = STATE.UNFURL;
        stateTime = 0;
        ui.setHoist(false, 1);
      }
      break;
    }

    case STATE.UNFURL: {
      gripWeight = THREE.MathUtils.damp(gripWeight, 0, 4, dt);
      // The knot slips, then the cloth peels open along its length.
      open = THREE.MathUtils.clamp((stateTime - 0.3) / 1.7, 0, 1);

      if (open > 0.015 && !flowersFired) {
        flowersFired = true;
        // The marigolds that were folded inside the bundle.
        petals.burst(new THREE.Vector3(0, flag.bundleY - 0.15, 0));
        crowd.setReaction(1);
        world.audio?.unfurl();
      }
      if (stateTime > 0.85 && !confettiFired) {
        confettiFired = true;
        petals.confetti(new THREE.Vector3(0, flag.bundleY - 1.2, 0.4));
      }
      salute = THREE.MathUtils.damp(salute, stateTime > 1.5 ? 1 : 0, 2.6, dt);

      if (stateTime > 4.2) {
        state = STATE.CELEBRATE;
        stateTime = 0;
        // The real date and time it happened, on their clock.
        ui.setCelebrateSub(moment ? `${moment.full}` : 'Jai Hind.');
      }
      break;
    }

    case STATE.CELEBRATE: {
      // They hold the salute until they walk out of it, which is roughly what
      // people do — stand to it for a moment, then go and find everyone.
      salute = THREE.MathUtils.damp(salute, controls.moving ? 0 : 1, 2, dt);
      // A beat of clean frame first. The hero shot is the thing people
      // screenshot, so it gets a couple of seconds with nothing on top of it
      // before the card slides in. Latched: testing `ui.current` instead would
      // drag the player back out of the poster the moment they opened it.
      if (stateTime > 2.4 && !celebrateShown) {
        celebrateShown = true;
        ui.show('celebrate');
        // Keep the shot the ceremony ended on, before the camera belongs to
        // the player again. The poster is captioned "I hoisted the flag", and
        // once they can walk off they will — a photograph taken facing a wall
        // two minutes later is not what that caption is describing. Read now,
        // while the cinematic frame is still the one on the canvas.
        heroShot = captureCanvas(canvas);
        // And the courtyard comes back with it. The orbit is a nice shot to
        // arrive on, but it is not somewhere to be stuck: the ceremony is
        // over, the society is still out there, and people want to walk round
        // and look at it. The gameplay camera picks up from wherever the
        // cinematic left off — it damps toward its mark rather than cutting,
        // so this reads as the camera settling rather than a jump.
        cine = 0;
        controls.setLocked(false);
        controls.setEnabled(true);
      }
      break;
    }
  }

  /* --- the flag --- */
  // Locked to the pull: the tricolour is exactly as far up the mast as the
  // hands are down the rope.
  hoist = pullPhase;
  hoistShown = THREE.MathUtils.damp(hoistShown, hoist, 12, dt);
  flag.setHoist(hoistShown);
  flag.setOpen(open);
  flag.update(dt, 0.8 + open * 0.55);

  if (state === STATE.HAUL || state === STATE.GRAB || state === STATE.TOP) {
    ui.setHoist(true, hoistShown);
  }

  /* --- the player --- */
  // Both of the states the player is on their own feet in. Without CELEBRATE
  // here they would slide around the courtyard after the ceremony with their
  // legs still.
  const walking = state === STATE.WALK || state === STATE.CELEBRATE;
  controls.update(dt, cine < 0.5);
  player.root.position.copy(controls.position);
  player.root.rotation.y = controls.heading;
  player.setPull(gripWeight, pullPhase);
  player.setEffort(gripWeight * (1 - Math.abs(pullPhase - 0.5) * 2));
  player.setSalute(salute);
  player.update(dt, walking ? controls.speed : 0, plaza.heightAt(controls.position.x, controls.position.z));

  // The rope goes wherever the hands are — the hands are the authority, so
  // the grip can never drift off the rope.
  if (gripWeight > 0.02) {
    player.handWorld(1, _a);
    player.handWorld(-1, _b);
    _grip.addVectors(_a, _b).multiplyScalar(0.5);
    flag.setGrip(_grip);
  } else {
    flag.setGrip(null);
  }

  if (cine > 0.5) updateCinematicCamera(dt);

  /* --- the rest of the world --- */
  petals.update(dt);
  crowd.setHoist(hoistShown);
  crowd.update(dt, elapsed);
  ceremony.update(elapsed);
  sky.update(dt);
  // The morning brightens as the ceremony proceeds — never past mid-morning.
  sky.setProgress(0.12 + hoistShown * 0.42 + open * 0.46, open * 0.35);
  plaza.sync(sky.state);

  gfx.sync(sky.state);
  gfx.render(dt);
}

/* ---------------------------- go ---------------------------- */

if (import.meta.env.DEV) {
  window.__game = {
    world,
    gfx,
    camera,
    quality,
    THREE,
    get state() {
      return state;
    },
    begin() {
      document.getElementById('btn-begin').click();
    },
    skipToRope() {
      world.controls.position.set(ROPE_MARK.x, 0, ROPE_MARK.z + 1.4);
      state = STATE.WALK;
      world.controls.setEnabled(true);
      ui.show('hud');
    },
    haul: () => pull(),
    /** Runs the world forward at a fixed timestep, ignoring the rAF clock. */
    advance(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) frame(step);
      return { state, hoist, open };
    },
    finish() {
      haulTime = HOIST_TIME;
      pullPhase = 1;
      hoist = 1;
      hoistShown = 1;
      gripWeight = 0;
      cine = 1;
      state = STATE.UNFURL;
      stateTime = 0;
      ui.show('hud');
    },
    /** Prints anybody whose feet are not on the ground. */
    auditFeet() {
      const bad = world.crowd.audit();
      console.table(bad.map((b) => ({ gap: b.gap.toFixed(4), x: b.p.root.position.x, z: b.p.root.position.z })));
      return bad.length;
    },
  };
}

boot()
  .then(() => tick(performance.now()))
  .catch((err) => {
    console.error(err);
    ui.fatal(err?.message ?? 'Something went wrong while loading.');
  });
