/**
 * How hard to push this device.
 *
 * Most people will meet this on a phone, so the phone is the case that has to
 * be right rather than the case that gets whatever is left over. A mid-range
 * Android running a 700-draw-call scene through a bloom chain at native
 * retina resolution will sit at fifteen frames a second and feel broken; the
 * same scene at a lower pixel ratio, with a smaller shadow map and forty-odd
 * people instead of sixty-two, is indistinguishable in a screenshot and runs.
 *
 * Detection is deliberately crude and conservative — screen size, pointer
 * type, core count, and the memory hint where the browser offers one. Getting
 * it wrong in the cautious direction costs a little fidelity; getting it wrong
 * the other way costs the whole experience.
 */

export function detectQuality() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const small = Math.min(w, h) < 500 || Math.max(w, h) < 900;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;

  const phone = coarse && small;
  const weak = phone || cores <= 4 || memory <= 4;

  if (phone && (cores <= 6 || memory <= 4)) {
    return {
      name: 'low',
      pixelRatio: 1.0,
      shadowMap: 1024,
      crowd: 40,
      bloom: true,
      petals: 0.55,
    };
  }
  if (weak) {
    return {
      name: 'medium',
      pixelRatio: 1.25,
      shadowMap: 1536,
      crowd: 50,
      bloom: true,
      petals: 0.8,
    };
  }
  return {
    name: 'high',
    pixelRatio: 1.5,
    shadowMap: 2048,
    crowd: 62,
    bloom: true,
    petals: 1,
  };
}
