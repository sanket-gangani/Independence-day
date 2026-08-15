/**
 * Shared terrain height field. The ground mesh, the trees, the footprints and
 * the player all read from this one function so nothing floats or sinks.
 */

// Cheap deterministic value noise — no dependency, stable across reloads.
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

function fbm(x, y, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * (valueNoise(x * f, y * f) * 2 - 1);
    amp *= 0.5;
    f *= 2.03;
  }
  return v;
}

/** Where the player starts and where the pole stands, in world space. */
export const PATH_START = { x: 0, z: 34 };
export const POLE_POS = { x: 0, z: -8 };

/**
 * Terrain height at a world point. Drifts and dips, but flattens along the
 * corridor between the spawn and the flagpole so the walk stays composed.
 */
export function terrainHeight(x, z) {
  const rolling = fbm(x * 0.021, z * 0.021, 4) * 2.6;
  const detail = fbm(x * 0.11, z * 0.11, 3) * 0.34;

  // Drifts pile up gently away from the middle of the valley.
  const valley = Math.min(1, Math.abs(x) / 70) ** 2 * 5.5;

  let h = rolling + detail + valley;

  // Flatten a soft corridor along x = 0 so the approach reads as a path.
  const corridor = Math.exp(-(x * x) / (2 * 7 * 7));
  h *= 1 - 0.86 * corridor;

  // And level the ground right around the pole so the flag stands true.
  const dp = Math.hypot(x - POLE_POS.x, z - POLE_POS.z);
  const pad = 1 - smoothstep(5, 14, dp);
  h *= 1 - 0.95 * pad;

  return h;
}

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Surface normal, sampled by finite difference. Used to lie footprints flat. */
export function terrainNormal(x, z, out) {
  const e = 0.6;
  const hl = terrainHeight(x - e, z);
  const hr = terrainHeight(x + e, z);
  const hd = terrainHeight(x, z - e);
  const hu = terrainHeight(x, z + e);
  out.set(hl - hr, 2 * e, hd - hu).normalize();
  return out;
}
