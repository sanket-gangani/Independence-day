/**
 * Sound.
 *
 * ON THE MUSIC YOU ASKED FOR
 * --------------------------
 * "Maa Tujhhe Salaam" is A. R. Rahman's recording and it is in copyright, so
 * it cannot be bundled into this repository or served from it. What this file
 * does instead is give it a proper slot: drop an audio file at
 *
 *     public/audio/theme.mp3
 *
 * and it is detected at load and used as the score, with the fade-in and the
 * swell at the unfurl already wired up. If you have licensed the track, or you
 * are running this privately with your own copy, that is the one step. If the
 * file is not there, the synthesised score below plays instead — a slow
 * shehnai-like lead over a tanpura drone in D, which is reverent and lands the
 * beat without pretending to be the real thing.
 *
 * EVERYTHING ELSE IS SYNTHESISED
 * ------------------------------
 * Morning ambience (birds, a distant scooter, the murmur of a crowd), the
 * creak of the halyard on every stroke, and the cheer when the tricolour
 * opens are all built in the Web Audio graph. Nothing to download.
 *
 * Audio starts muted and only wakes on a user gesture, because every browser
 * blocks it otherwise and because nobody wants a website shouting at them.
 */

const THEME_URL = 'audio/theme.mp3';

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let ambienceGain = null;
  let started = false;
  let muted = true;
  let theme = null; // HTMLAudioElement if a real track was supplied
  let themeAvailable = false;
  const voices = [];

  /* --- helpers ---------------------------------------------------------- */

  const now = () => ctx.currentTime;

  function noiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Brown-ish noise: integrated white, which sits under a scene far better
    // than white noise's hiss.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function env(gain, peak, attack, hold, release, at = now()) {
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    gain.gain.setValueAtTime(Math.max(peak, 0.0002), at + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  }

  /** A plucked/blown tone. Used for the score and the little accents. */
  function tone({ freq, type = 'triangle', peak = 0.12, attack = 0.02, hold = 0.2, release = 0.6, detune = 0, dest }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(g);
    g.connect(dest || musicGain);
    env(g, peak, attack, hold, release);
    osc.start();
    osc.stop(now() + attack + hold + release + 0.1);
    voices.push(osc);
    return osc;
  }

  /* --- ambience --------------------------------------------------------- */

  function startAmbience() {
    // A soft bed of air.
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer(4);
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 420;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.05;
    air.connect(airFilter).connect(airGain).connect(ambienceGain);
    air.start();

    // The murmur of sixty people waiting: band-passed noise, slowly wobbling.
    const murmur = ctx.createBufferSource();
    murmur.buffer = noiseBuffer(5);
    murmur.loop = true;
    const murmurFilter = ctx.createBiquadFilter();
    murmurFilter.type = 'bandpass';
    murmurFilter.frequency.value = 640;
    murmurFilter.Q.value = 1.1;
    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(murmurGain.gain);
    lfo.start();
    murmur.connect(murmurFilter).connect(murmurGain).connect(ambienceGain);
    murmur.start();

    // Birds. Two or three short whistles, at irregular intervals, forever.
    const birdAt = () => {
      if (!started) return;
      const notes = 2 + Math.floor(Math.random() * 3);
      const base = 1900 + Math.random() * 1400;
      for (let i = 0; i < notes; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const t = now() + i * (0.08 + Math.random() * 0.07);
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * (1.1 + Math.random() * 0.5), t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.11);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        osc.connect(g).connect(ambienceGain);
        osc.start(t);
        osc.stop(t + 0.2);
      }
      setTimeout(birdAt, 2600 + Math.random() * 7000);
    };
    setTimeout(birdAt, 900);

    // A scooter going past on the society road, once in a while.
    const scooterAt = () => {
      if (!started) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(3);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      const g = ctx.createGain();
      const t = now();
      f.frequency.setValueAtTime(130, t);
      f.frequency.linearRampToValueAtTime(210, t + 2.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      src.connect(f).connect(g).connect(ambienceGain);
      src.start(t);
      src.stop(t + 2.8);
      setTimeout(scooterAt, 14000 + Math.random() * 22000);
    };
    setTimeout(scooterAt, 6000 + Math.random() * 8000);
  }

  /* --- the synthesised score -------------------------------------------- */
  //
  // Raga-flavoured rather than western: a drone on D and A, and a slow lead
  // that walks D - E - F# - A - B. Written as a loop that can be swelled at
  // the unfurl and left running under the ending.

  let scoreTimer = null;
  let scoreLevel = 0.5;

  function startScore() {
    if (theme) {
      theme.volume = 0;
      theme.loop = true;
      const play = theme.play();
      if (play?.catch) play.catch(() => {});
      fadeTheme(0.45, 3);
      return;
    }

    // Tanpura-ish drone.
    for (const f of [73.42, 110.0, 146.83]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 620;
      g.gain.value = 0.028;
      osc.connect(lp).connect(g).connect(musicGain);
      osc.start();
      voices.push(osc);
    }

    const SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
    let step = 0;
    const next = () => {
      if (!started) return;
      const f = SCALE[step % SCALE.length];
      // The lead, doubled an octave down and slightly detuned, which is what
      // stops a triangle wave sounding like a test tone.
      tone({ freq: f, type: 'triangle', peak: 0.075 * scoreLevel, attack: 0.28, hold: 0.5, release: 1.5 });
      tone({ freq: f / 2, type: 'sine', peak: 0.05 * scoreLevel, attack: 0.3, hold: 0.6, release: 1.8, detune: -6 });
      step += step % 3 === 2 ? 2 : 1;
      scoreTimer = setTimeout(next, 1500 + Math.random() * 500);
    };
    next();
  }

  function fadeTheme(to, seconds) {
    if (!theme) return;
    const from = theme.volume;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      theme.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  /* --- api -------------------------------------------------------------- */

  const api = {
    get muted() {
      return muted;
    },
    get usingRealTrack() {
      return themeAvailable;
    },

    /**
     * Looks for a supplied track. Safe to call before any user gesture — it
     * only probes whether the file exists.
     */
    async probe() {
      try {
        const res = await fetch(THEME_URL, { method: 'HEAD' });
        themeAvailable = res.ok && !String(res.headers.get('content-type') || '').includes('text/html');
      } catch {
        themeAvailable = false;
      }
      return themeAvailable;
    },

    /** Must be called from a user gesture. */
    start() {
      if (started) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 1;
      musicGain.connect(master);
      ambienceGain = ctx.createGain();
      ambienceGain.gain.value = 1;
      ambienceGain.connect(master);

      if (themeAvailable) {
        theme = new Audio(THEME_URL);
        theme.crossOrigin = 'anonymous';
        theme.preload = 'auto';
      }

      started = true;
      startAmbience();
      startScore();
      api.setMuted(false);
    },

    setMuted(v) {
      muted = v;
      if (!started) return;
      const target = v ? 0.0001 : 0.85;
      master.gain.cancelScheduledValues(now());
      master.gain.setTargetAtTime(target, now(), 0.25);
      if (theme) theme.muted = v;
    },
    toggleMute() {
      api.setMuted(!muted);
      return muted;
    },

    /** One haul: rope through a sheave, plus the creak of the mast. */
    rope() {
      if (!started || muted) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(1);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 2.2;
      const g = ctx.createGain();
      const t = now();
      f.frequency.setValueAtTime(1100, t);
      f.frequency.linearRampToValueAtTime(2100, t + 0.34);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      src.connect(f).connect(g).connect(ambienceGain);
      src.start(t);
      src.stop(t + 0.5);
      // The pulley squeak.
      tone({ freq: 620 + Math.random() * 140, type: 'sine', peak: 0.018, attack: 0.05, hold: 0.06, release: 0.25, dest: ambienceGain });
    },

    /** The flag opens: a swell, and sixty people reacting. */
    unfurl() {
      if (!started) return;
      scoreLevel = 1;
      fadeTheme(0.75, 1.5);

      if (muted) return;
      // Cloth snapping open.
      const snap = ctx.createBufferSource();
      snap.buffer = noiseBuffer(1);
      const sf = ctx.createBiquadFilter();
      sf.type = 'highpass';
      sf.frequency.value = 900;
      const sg = ctx.createGain();
      const t = now();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      snap.connect(sf).connect(sg).connect(ambienceGain);
      snap.start(t);
      snap.stop(t + 0.6);

      // The cheer: a broad band of noise that rises and settles into applause.
      const cheer = ctx.createBufferSource();
      cheer.buffer = noiseBuffer(6);
      cheer.loop = true;
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = 900;
      cf.Q.value = 0.8;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t + 0.1);
      cg.gain.exponentialRampToValueAtTime(0.16, t + 0.7);
      cg.gain.exponentialRampToValueAtTime(0.05, t + 4.0);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 11);
      cheer.connect(cf).connect(cg).connect(ambienceGain);
      cheer.start(t + 0.1);
      cheer.stop(t + 12);

      // Applause: short bright transients, thinning out.
      for (let i = 0; i < 150; i++) {
        const at = t + 0.5 + Math.pow(Math.random(), 0.6) * 7;
        const clap = ctx.createBufferSource();
        clap.buffer = noiseBuffer(0.2);
        const hf = ctx.createBiquadFilter();
        hf.type = 'highpass';
        hf.frequency.value = 1200 + Math.random() * 1800;
        const cgg = ctx.createGain();
        cgg.gain.setValueAtTime(0.0001, at);
        cgg.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.02, at + 0.006);
        cgg.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        clap.connect(hf).connect(cgg).connect(ambienceGain);
        clap.start(at);
        clap.stop(at + 0.14);
      }
    },

    dispose() {
      started = false;
      clearTimeout(scoreTimer);
      for (const v of voices) {
        try {
          v.stop();
        } catch {
          /* already stopped */
        }
      }
      theme?.pause();
      ctx?.close();
    },
  };

  return api;
}
