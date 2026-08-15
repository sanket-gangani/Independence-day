/**
 * Deterministic randomness.
 *
 * Every crowd member, every balcony, every crack in the paving is derived from
 * a seed. That means the scene is the same on every reload — you can tune a
 * detail and actually see whether it got better, instead of chasing a new
 * random layout each time.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrapper with the helpers that actually get used. */
export function rng(seed) {
  const r = mulberry32(seed);
  const api = () => r();
  api.range = (lo, hi) => lo + r() * (hi - lo);
  api.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  api.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  api.chance = (p) => r() < p;
  /** Weighted pick: pass [[value, weight], ...]. */
  api.weighted = (pairs) => {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let n = r() * total;
    for (const [v, w] of pairs) {
      n -= w;
      if (n <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  };
  return api;
}
