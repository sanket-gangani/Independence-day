import { Howl } from 'howler';

/**
 * Sound.
 *
 * Two layers, both authored in the Web Audio graph rather than shipped as
 * files: a wind bed that runs the whole time, and a slow orchestral-ish pad
 * score that fades in when the player starts walking and swells at the salute.
 *
 * If you drop a real track at `public/audio/theme.mp3` it is used instead of
 * the synthesised score — see README. Everything starts on the first key press,
 * which is the gesture browsers require to unlock audio.
 */

// D major. Reverent, open, and it sits well under a swell.
const PROGRESSION = [
  [146.83, 220.0, 293.66, 369.99], // D  (D3 A3 D4 F#4)
  [123.47, 185.0, 246.94, 293.66], // Bm (B2 F#3 B3 D4)
  [98.0, 196.0, 246.94, 293.66], // G  (G2 G3 B3 D4)
  [110.0, 164.81, 220.0, 277.18], // A  (A2 E3 A3 C#4)
];

const CHORD_SECONDS = 7.5;

export function createAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let padGain = null;
  let swellGain = null;
  let reverb = null;
  let started = false;
  let scoreOn = false;
  let chordIndex = 0;
  let nextChordAt = 0;
  let schedulerId = 0;
  let external = null; // Howl, when a real track is present
  let externalReady = false;
  // Starts muted; press M to bring the wind and the score in.
  let muted = true;

  function makeReverb(seconds = 3.4, decay = 2.6) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    const node = ctx.createConvolver();
    node.buffer = buf;
    return node;
  }

  function makeNoiseBuffer(seconds = 4) {
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // Brown-ish noise: gentler and less hissy than white for wind.
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  // --- wind ---------------------------------------------------------------

  function startWind() {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(6);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'highpass';
    lowShelf.frequency.value = 140;

    // Two slow LFOs: one opens the filter, one breathes the level, so gusts
    // never land on the same beat twice.
    const lfoA = ctx.createOscillator();
    lfoA.frequency.value = 0.055;
    const lfoAGain = ctx.createGain();
    lfoAGain.gain.value = 260;
    lfoA.connect(lfoAGain).connect(band.frequency);
    lfoA.start();

    const lfoB = ctx.createOscillator();
    lfoB.frequency.value = 0.083;
    const lfoBGain = ctx.createGain();
    lfoBGain.gain.value = 0.35;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 0.6;
    lfoB.connect(lfoBGain).connect(gustGain.gain);
    lfoB.start();

    src.connect(band).connect(lowShelf).connect(gustGain).connect(windGain);
    src.start();
  }

  // --- synthesised score --------------------------------------------------

  function playChord(freqs, at, duration) {
    const attack = 2.4;
    const release = 3.2;

    freqs.forEach((f, i) => {
      // Two detuned voices per note gives the pad some width.
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, at);
        filter.frequency.linearRampToValueAtTime(1250, at + attack * 1.4);
        filter.frequency.linearRampToValueAtTime(500, at + duration + release);
        filter.Q.value = 0.5;

        const g = ctx.createGain();
        const peak = (i === 0 ? 0.16 : 0.075) / freqs.length;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(peak, at + attack);
        g.gain.setValueAtTime(peak, at + duration);
        g.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);

        osc.connect(filter).connect(g).connect(padGain);
        osc.start(at);
        osc.stop(at + duration + release + 0.2);
      }
    });

    // Sub an octave below the root, for weight.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freqs[0] / 2;
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, at);
    subGain.gain.linearRampToValueAtTime(0.12, at + attack);
    subGain.gain.setValueAtTime(0.12, at + duration);
    subGain.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);
    sub.connect(subGain).connect(padGain);
    sub.start(at);
    sub.stop(at + duration + release + 0.2);

    // The swell layer: an octave up, silent until the salute opens its gain.
    freqs.slice(1).forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f * 2;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.055, at + attack);
      g.gain.setValueAtTime(0.055, at + duration);
      g.gain.exponentialRampToValueAtTime(0.0001, at + duration + release);
      osc.connect(filter).connect(g).connect(swellGain);
      osc.start(at);
      osc.stop(at + duration + release + 0.2);
    });
  }

  /** Soft timpani-ish hit, used to punctuate the moment the flag tops out. */
  function drum(at, freq = 62, gain = 0.5) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.6, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.12);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);

    osc.connect(g).connect(swellGain);
    osc.start(at);
    osc.stop(at + 2.0);
  }

  function scheduler() {
    if (!scoreOn || external) return;
    const now = ctx.currentTime;
    while (nextChordAt < now + 1.5) {
      playChord(PROGRESSION[chordIndex % PROGRESSION.length], nextChordAt, CHORD_SECONDS);
      chordIndex++;
      nextChordAt += CHORD_SECONDS;
    }
  }

  // --- public -------------------------------------------------------------

  function ramp(param, value, seconds) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  return {
    get started() {
      return started;
    },

    /** Diagnostics — is the graph actually running and passing signal? */
    get status() {
      return {
        started,
        scoreOn,
        external: !!external,
        contextState: ctx?.state ?? 'none',
        wind: windGain?.gain.value ?? 0,
        pad: padGain?.gain.value ?? 0,
        swell: swellGain?.gain.value ?? 0,
        master: master?.gain.value ?? 0,
      };
    },

    /** Probe for an optional real music track before the title card appears. */
    async probeExternalTrack() {
      try {
        const res = await fetch('audio/theme.mp3', { method: 'HEAD' });
        const type = res.headers.get('content-type') || '';
        // A dev server happily 200s an index.html for a missing file, so make
        // sure we actually got audio back before wiring it up.
        if (res.ok && !type.includes('text/html')) {
          externalReady = true;
        }
      } catch {
        externalReady = false;
      }
      return externalReady;
    },

    /** Must be called from a user gesture. */
    start() {
      if (started) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      started = true;

      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);

      reverb = makeReverb();
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      reverb.connect(wet).connect(master);

      windGain = ctx.createGain();
      windGain.gain.value = 0.0001;
      windGain.connect(master);

      padGain = ctx.createGain();
      padGain.gain.value = 0.0001;
      padGain.connect(master);
      padGain.connect(reverb);

      swellGain = ctx.createGain();
      swellGain.gain.value = 0.0001;
      swellGain.connect(master);
      swellGain.connect(reverb);

      startWind();
      ramp(windGain.gain, 0.16, 5);

      if (externalReady) {
        external = new Howl({
          src: ['audio/theme.mp3'],
          loop: true,
          volume: 0,
          html5: false,
        });
      }

      schedulerId = setInterval(scheduler, 400);
      ctx.resume?.();
    },

    /** Music enters once the walk begins. */
    beginScore() {
      if (!started || scoreOn) return;
      scoreOn = true;
      if (external) {
        external.play();
        external.fade(0, 0.32, 9000);
      } else {
        nextChordAt = ctx.currentTime + 0.4;
        chordIndex = 0;
        scheduler();
        ramp(padGain.gain, 0.5, 9);
      }
    },

    /** The payoff: the flag tops out, the score opens up. */
    swell() {
      if (!started) return;
      if (external) {
        external.fade(external.volume(), 0.85, 2600);
      } else {
        ramp(padGain.gain, 0.78, 2.2);
        ramp(swellGain.gain, 0.9, 2.6);
        const t = ctx.currentTime;
        drum(t + 0.05, 62, 0.55);
        drum(t + 1.5, 82, 0.3);
        drum(t + 2.6, 62, 0.22);
      }
      ramp(windGain.gain, 0.1, 3);
    },

    /** Long tail under the closing card. */
    settle() {
      if (!started) return;
      if (external) external.fade(external.volume(), 0.45, 8000);
      else {
        ramp(padGain.gain, 0.42, 8);
        ramp(swellGain.gain, 0.4, 8);
      }
      ramp(windGain.gain, 0.14, 8);
    },

    /** Wind rises a little as you climb toward the pole. */
    setWindIntensity(v) {
      if (!started || !windGain) return;
      ramp(windGain.gain, 0.12 + v * 0.1, 1.5);
    },

    toggleMute() {
      muted = !muted;
      if (master) ramp(master.gain, muted ? 0 : 1, 0.3);
      return muted;
    },

    dispose() {
      clearInterval(schedulerId);
      external?.unload();
      ctx?.close();
    },
  };
}
