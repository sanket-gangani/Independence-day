import * as THREE from 'three';
import { mulberry32 } from './rng.js';

/**
 * Every surface in this scene is drawn on a canvas at boot — nothing to
 * download, nothing to license, and the tricolour comes out geometrically
 * exact rather than approximately right.
 *
 * The rule followed throughout: no flat fills. Real concrete is blotchy, real
 * paving is laid slightly crooked with weeds in the joints, real distemper is
 * streaked where the monsoon ran down it. Every texture here ends with a pass
 * of grain, stains or wear, because that is the entire difference between
 * "3D scene" and "somewhere".
 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function finish(c, { repeat = 1, aniso = 8, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  return tex;
}

/** Speckle noise, the workhorse for making a fill look like a material. */
function grain(ctx, w, h, amount, rand = Math.random) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, count, colors, rand, rMin = 8, rMax = 60) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = colors[Math.floor(rand() * colors.length)];
    g.addColorStop(0, col);
    g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ================================================================== */
/* the flag                                                            */
/* ================================================================== */

/**
 * The Indian national flag: 3:2, equal horizontal bands of India saffron,
 * white and India green, with the navy Ashoka Chakra centred in the white
 * band at three quarters of the band's height.
 *
 * The chakra is drawn as one object with the rest of the flag — 24 spindle
 * spokes, the hub, the inner and outer rims and the 24 rim beads — so it can
 * never arrive late, sit off-centre, or appear as a separate sprite. There is
 * exactly one texture, and it is either complete or it does not exist.
 */
export function makeFlagTexture(width = 1536) {
  const W = width;
  const H = Math.round(W / 1.5);
  const { c, ctx } = canvas(W, H);
  const band = H / 3;
  const rand = mulberry32(4242);

  ctx.fillStyle = '#FF9933';
  ctx.fillRect(0, 0, W, band + 1);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, band, W, band + 1);
  ctx.fillStyle = '#138808';
  ctx.fillRect(0, band * 2, W, band);

  // --- Ashoka Chakra ---
  const cx = W / 2;
  const cy = H / 2;
  const R = (band * 0.75) / 2;
  const NAVY = '#000080';

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = NAVY;
  ctx.strokeStyle = NAVY;

  // Outer rim.
  ctx.lineWidth = R * 0.075;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.96, 0, Math.PI * 2);
  ctx.stroke();

  // 24 spokes, spindle-shaped: they taper to a point at the hub and at the
  // rim, and are widest a little past halfway out. Straight lines read as a
  // wheel diagram; these read as the chakra.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a);
    const inner = R * 0.115;
    const outer = R * 0.9;
    const wide = R * 0.038;
    ctx.beginPath();
    ctx.moveTo(inner, 0);
    ctx.quadraticCurveTo(R * 0.5, -wide, outer, 0);
    ctx.quadraticCurveTo(R * 0.5, wide, inner, 0);
    ctx.fill();
    ctx.restore();

    // The bead between each pair of spokes, sitting just inside the rim.
    const b = a + Math.PI / 24;
    ctx.beginPath();
    ctx.arc(Math.cos(b) * R * 0.845, Math.sin(b) * R * 0.845, R * 0.043, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hub: filled centre with a white ring inside it.
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.135, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.052, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- cloth ---
  // A stitched hoist sleeve down the left edge, and a hem all round.
  ctx.strokeStyle = 'rgba(120,105,80,0.35)';
  ctx.lineWidth = Math.max(2, W * 0.0022);
  ctx.setLineDash([W * 0.008, W * 0.006]);
  ctx.beginPath();
  ctx.moveTo(W * 0.018, 0);
  ctx.lineTo(W * 0.018, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Weave: fine warp and weft, plus a soft vertical fold memory from being
  // rolled around the pole.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const weave = (Math.sin(x * 1.9) + Math.sin(y * 2.4)) * 2.6;
      const fold = Math.sin(x * 0.06) * 3.2;
      const n = weave + fold + (rand() - 0.5) * 8;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/* ================================================================== */
/* particles                                                           */
/* ================================================================== */

/** Marigold petal — genda phool is *the* flower of an Indian celebration. */
export function makePetalSprite() {
  const S = 96;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S * 0.5, S * 0.36, 2, S * 0.5, S * 0.52, S * 0.5);
  g.addColorStop(0, 'rgba(255,240,186,1)');
  g.addColorStop(0.4, 'rgba(255,182,58,1)');
  g.addColorStop(0.82, 'rgba(236,124,22,1)');
  g.addColorStop(1, 'rgba(214,96,14,0)');

  ctx.fillStyle = g;
  // A ruffled petal outline rather than an ellipse.
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const r = (0.30 + Math.sin(t * 5) * 0.02) * S;
    ctx.lineTo(S / 2 + Math.cos(t) * r * 0.82, S / 2 + Math.sin(t) * r * 1.42);
  }
  ctx.closePath();
  ctx.fill();

  // Veins.
  ctx.strokeStyle = 'rgba(200,96,12,0.28)';
  ctx.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(S / 2, S * 0.9);
    ctx.quadraticCurveTo(S / 2 + i * 5, S / 2, S / 2 + i * 9, S * 0.14);
    ctx.stroke();
  }

  return finish(c, { aniso: 2 });
}

/** A single rectangle of foil, for the tricolour confetti. */
export function makeConfettiSprite() {
  const S = 64;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(S * 0.22, S * 0.06, S * 0.56, S * 0.88);
  // A crease down the middle so it catches the light unevenly.
  const g = ctx.createLinearGradient(S * 0.22, 0, S * 0.78, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.28)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(S * 0.22, S * 0.06, S * 0.56, S * 0.88);
  return finish(c, { aniso: 2 });
}

/** Soft glow disc, for the sun and its halo. */
export function makeGlowSprite(inner = 'rgba(255,246,220,1)', mid = 'rgba(255,192,110,0.42)') {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, inner);
  g.addColorStop(0.16, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1.0, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, { aniso: 2 });
}

/** A flat marigold bloom, seen face on — used for garlands and baskets. */
export function makeMarigoldSprite() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const M = S / 2;
  for (let ring = 3; ring >= 0; ring--) {
    const rr = M * (0.32 + ring * 0.2);
    const n = 8 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      const g = ctx.createRadialGradient(M + Math.cos(a) * rr * 0.6, M + Math.sin(a) * rr * 0.6, 1, M + Math.cos(a) * rr, M + Math.sin(a) * rr, M * 0.24);
      g.addColorStop(0, ring % 2 ? '#ffd257' : '#ffab26');
      g.addColorStop(1, ring % 2 ? '#f0a92e' : '#e07c14');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(M + Math.cos(a) * rr, M + Math.sin(a) * rr, M * 0.19, M * 0.15, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c, { aniso: 4 });
}

/* ================================================================== */
/* ground                                                              */
/* ================================================================== */

/**
 * Interlocking paver blocks — the surface of practically every society
 * courtyard in India. Laid in a running bond, each block a slightly different
 * shade, joints filled with sand, and the odd chipped corner.
 */
export function makePaverTexture(S = 1024) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(91);

  // Dark sand-filled joints show through between the blocks.
  ctx.fillStyle = '#4e483e';
  ctx.fillRect(0, 0, S, S);

  const rows = 14;
  const bh = S / rows;
  const bw = bh * 2;
  // Grey blocks with a scatter of the red ones every society yard has.
  const shades = [
    '#8e877a', '#847d71', '#968f82', '#7c766a', '#8a8377', '#918a7d', '#726c62',
    '#9a5f4a', '#8d5742',
  ];

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2) + (rand() - 0.5) * 3;
    for (let i = -1; i <= S / bw + 1; i++) {
      const x = i * bw + offset;
      const y = r * bh;
      const jx = (rand() - 0.5) * 2;
      const jy = (rand() - 0.5) * 2;
      const w = bw - 5;
      const h = bh - 5;
      ctx.fillStyle = shades[Math.floor(rand() * shades.length)];
      ctx.fillRect(x + 2.5 + jx, y + 2.5 + jy, w, h);
      // Lit top edge, shadowed bottom edge: the chamfer on every paver block,
      // and the thing that makes paving read as laid rather than printed.
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x + 2.5 + jx, y + 2.5 + jy, w, 3);
      ctx.fillRect(x + 2.5 + jx, y + 2.5 + jy, 3, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 2.5 + jx, y + bh - 5.5 + jy, w, 3.2);
      ctx.fillRect(x + bw - 5.5 + jx, y + 2.5 + jy, 3.2, h);
    }
  }

  // Wear: dirt tracked across it, damp patches, moss in the joints. Kept
  // subtle — heavy blotching at this scale reads as sand, not paving.
  blotches(
    ctx, S, S, 46,
    ['rgba(70,64,52,0.18)', 'rgba(150,142,124,0.12)', 'rgba(86,94,64,0.12)'],
    rand, 30, 150
  );
  grain(ctx, S, S, 12, rand);
  return finish(c, { repeat: 1 });
}

/** Society road: patched, dusty asphalt with a faded edge line. */
export function makeRoadTexture(S = 512) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(17);
  ctx.fillStyle = '#4b4741';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 130, ['rgba(92,86,78,0.4)', 'rgba(38,36,33,0.4)', 'rgba(110,102,90,0.3)'], rand, 10, 90);
  // Aggregate.
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = `rgba(${140 + rand() * 70 | 0},${134 + rand() * 60 | 0},${124 + rand() * 50 | 0},${0.1 + rand() * 0.2})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Cracks.
  ctx.strokeStyle = 'rgba(26,24,22,0.5)';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = 0.6 + rand() * 1.6;
    ctx.beginPath();
    let x = rand() * S;
    let y = rand() * S;
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rand() - 0.5) * 90;
      y += (rand() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, S, S, 16, rand);
  return finish(c, { repeat: 1 });
}

/** Patchy society lawn — thin, sun-worn, not a golf green. */
export function makeGrassTexture(S = 512) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(53);
  ctx.fillStyle = '#6e7f47';
  ctx.fillRect(0, 0, S, S);
  blotches(
    ctx, S, S, 160,
    ['rgba(122,138,78,0.5)', 'rgba(86,98,54,0.5)', 'rgba(150,146,96,0.4)', 'rgba(104,120,64,0.5)'],
    rand, 14, 90
  );
  // Blades.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const l = 2 + rand() * 5;
    ctx.strokeStyle = `rgba(${88 + rand() * 70 | 0},${104 + rand() * 60 | 0},${48 + rand() * 40 | 0},${0.3 + rand() * 0.4})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - l);
    ctx.stroke();
  }
  grain(ctx, S, S, 12, rand);
  return finish(c, { repeat: 1 });
}

/** Loose earth, for garden beds and the strip along the compound wall. */
export function makeSoilTexture(S = 256) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(71);
  ctx.fillStyle = '#7a6046';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 90, ['rgba(104,82,60,0.5)', 'rgba(64,50,36,0.45)', 'rgba(126,102,74,0.4)'], rand, 6, 44);
  grain(ctx, S, S, 24, rand);
  return finish(c, { repeat: 1 });
}

/**
 * Rangoli, drawn as a transparent decal laid on the paving in front of the
 * pole. Chalk and flower petals, a bit uneven — done by hand this morning.
 */
export function makeRangoliTexture(S = 1024) {
  const { c, ctx } = canvas(S, S);
  const M = S / 2;
  const rand = mulberry32(1947);

  ctx.translate(M, M);

  const dot = (x, y, r, color, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  // Chalk guide circles.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  for (const rr of [0.2, 0.33, 0.46]) {
    ctx.lineWidth = 4 + rand() * 3;
    ctx.beginPath();
    ctx.arc(0, 0, M * rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Petal rings, laid one flower at a time so they wobble like real ones.
  const rings = [
    { r: 0.46, n: 44, cols: ['#ff9c33', '#ffb455'], size: 15 },
    { r: 0.395, n: 38, cols: ['#ffffff', '#f4f0e4'], size: 13 },
    { r: 0.33, n: 32, cols: ['#1f8a12', '#2ba018'], size: 13 },
    { r: 0.255, n: 24, cols: ['#ff9c33', '#e8801f'], size: 14 },
    { r: 0.16, n: 16, cols: ['#c0203a', '#e03a52'], size: 13 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + rand() * 0.05;
      const rr = M * ring.r + (rand() - 0.5) * 8;
      dot(Math.cos(a) * rr, Math.sin(a) * rr, ring.size + rand() * 4, ring.cols[i % ring.cols.length], 0.9);
    }
  }

  // Eight-petal lotus in the middle.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = i % 2 ? 'rgba(255,160,60,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(M * 0.05, -M * 0.08, 0, -M * 0.13);
    ctx.quadraticCurveTo(-M * 0.05, -M * 0.08, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  dot(0, 0, M * 0.035, '#c0203a', 0.95);

  // Scattered loose petals around the edge — nothing is ever tidy.
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const rr = M * (0.48 + rand() * 0.16);
    dot(Math.cos(a) * rr, Math.sin(a) * rr, 5 + rand() * 7, rand() > 0.5 ? '#ffa93a' : '#f2e9d6', 0.4 + rand() * 0.4);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ================================================================== */
/* buildings                                                           */
/* ================================================================== */

/**
 * Distempered concrete: the cream, ochre and pale-blue paint on every
 * mid-rise in the country, streaked black under the sills where ten monsoons
 * have run down it.
 */
export function makeWallTexture(base = '#e8dcc4', S = 512, seedN = 5) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(seedN);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  blotches(ctx, S, S, 60, ['rgba(255,255,255,0.25)', 'rgba(120,108,88,0.18)', 'rgba(190,180,160,0.2)'], rand, 30, 180);

  // Damp staining, always running downward.
  for (let i = 0; i < 26; i++) {
    const x = rand() * S;
    const y = rand() * S * 0.7;
    const h = 40 + rand() * 200;
    const w = 6 + rand() * 26;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(92,84,70,0.30)');
    g.addColorStop(1, 'rgba(92,84,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // Flaking paint.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${180 + rand() * 40 | 0},${170 + rand() * 40 | 0},${150 + rand() * 40 | 0},${0.14 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 4 + rand() * 22, 3 + rand() * 16, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 13, rand);
  return finish(c, { repeat: 1 });
}

/**
 * A window: frame, glass, a curtain behind about half of them, and a grille
 * over some. Reflections come from the sky colour, not from a cubemap.
 */
export function makeWindowTexture(S = 256, seedN = 3) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(seedN);

  // Dark interior.
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#3d4a55');
  g.addColorStop(1, '#22282e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Curtain on some.
  if (rand() < 0.55) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(214,196,164,0.86)' : 'rgba(168,186,196,0.8)';
    const w = S * (0.3 + rand() * 0.45);
    ctx.fillRect(rand() < 0.5 ? 0 : S - w, 0, w, S);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 8; i++) ctx.fillRect(rand() * S, 0, 3, S);
  }
  // A warm light on inside a few.
  if (rand() < 0.28) {
    ctx.fillStyle = 'rgba(255,214,150,0.5)';
    ctx.fillRect(0, 0, S, S);
  }
  // Sky reflection across the glass.
  const r = ctx.createLinearGradient(0, 0, S, S);
  r.addColorStop(0, 'rgba(210,228,244,0.55)');
  r.addColorStop(0.45, 'rgba(180,204,226,0.12)');
  r.addColorStop(1, 'rgba(120,140,160,0.05)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, S, S);

  // Frame and mullions.
  ctx.strokeStyle = '#6d6558';
  ctx.lineWidth = S * 0.05;
  ctx.strokeRect(0, 0, S, S);
  ctx.lineWidth = S * 0.028;
  ctx.beginPath();
  ctx.moveTo(S / 2, 0);
  ctx.lineTo(S / 2, S);
  ctx.moveTo(0, S * 0.42);
  ctx.lineTo(S, S * 0.42);
  ctx.stroke();

  // Safety grille on the lower floors.
  if (rand() < 0.5) {
    ctx.strokeStyle = 'rgba(60,56,50,0.75)';
    ctx.lineWidth = S * 0.012;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 6) * S, 0);
      ctx.lineTo((i / 6) * S, S);
      ctx.stroke();
    }
  }
  return finish(c, { aniso: 4 });
}

/** Bare concrete: parapets, kerbs, the plinth under the flagpole. */
export function makeConcreteTexture(S = 512, seedN = 11) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(seedN);
  ctx.fillStyle = '#b6b0a4';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 70, ['rgba(150,144,132,0.4)', 'rgba(198,192,180,0.4)', 'rgba(120,116,106,0.25)'], rand, 16, 110);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 90 | 0},${88 + rand() * 84 | 0},${82 + rand() * 76 | 0},0.28)`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
  }
  grain(ctx, S, S, 16, rand);
  return finish(c, { repeat: 1 });
}

/**
 * Halyard rope: white nylon, three strands laid up in a right-hand twist.
 *
 * White rather than jute, both because that is what an actual flagpole halyard
 * is, and because a dark rope disappears against the paving and against the
 * crowd — and this rope is the one object in the scene the player has to
 * notice. The diagonal banding is what makes a tube read as rope from ten
 * metres away rather than as a wire.
 */
export function makeRopeTexture(W = 256, H = 64) {
  const { c, ctx } = canvas(W, H);
  const rand = mulberry32(37);
  ctx.fillStyle = '#d9d4c6';
  ctx.fillRect(0, 0, W, H);

  // Strands run diagonally across the unwrapped tube.
  ctx.lineWidth = H / 3.1;
  ctx.lineCap = 'butt';
  for (let i = -6; i < 22; i++) {
    const x = (i / 16) * W;
    const g = ctx.createLinearGradient(x, 0, x + W / 9, H);
    g.addColorStop(0, '#b0a894');
    g.addColorStop(0.38, '#f2eee2');
    g.addColorStop(0.6, '#ffffff');
    g.addColorStop(1, '#a49c88');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, -2);
    ctx.lineTo(x + W / 9, H + 2);
    ctx.stroke();
  }
  // Loose fibres, and the grime a rope picks up where hands go.
  for (let i = 0; i < 700; i++) {
    const dirty = rand() < 0.25;
    ctx.strokeStyle = dirty
      ? `rgba(${150 + rand() * 40 | 0},${142 + rand() * 40 | 0},${126 + rand() * 40 | 0},${0.1 + rand() * 0.25})`
      : `rgba(255,255,255,${0.12 + rand() * 0.35})`;
    ctx.lineWidth = 0.7;
    const x = rand() * W;
    const y = rand() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + rand() * 8, y + 6 + rand() * 8);
    ctx.stroke();
  }
  grain(ctx, W, H, 12, rand);
  return finish(c, { aniso: 8 });
}

/** Bark, for the tree trunks. */
export function makeBarkTexture(S = 256) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(29);
  ctx.fillStyle = '#5d4b3a';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const x = rand() * S;
    ctx.strokeStyle = `rgba(${30 + rand() * 60 | 0},${24 + rand() * 50 | 0},${18 + rand() * 40 | 0},${0.2 + rand() * 0.4})`;
    ctx.lineWidth = 1 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y < S; y += 16) {
      xx += (rand() - 0.5) * 7;
      ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  blotches(ctx, S, S, 30, ['rgba(150,146,120,0.25)', 'rgba(60,52,40,0.3)'], rand, 8, 40);
  grain(ctx, S, S, 18, rand);
  return finish(c, { repeat: 1 });
}

/**
 * Foliage card: a clump of leaves with a cut-out alpha, used on crossed
 * billboards. Far more convincing than a green sphere, and far cheaper than
 * modelled leaves.
 */
export function makeLeafTexture(kind = 'neem', S = 512) {
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(kind === 'neem' ? 3 : kind === 'gulmohar' ? 9 : 15);
  ctx.clearRect(0, 0, S, S);

  const palettes = {
    neem: ['#3f6b2c', '#4d7d33', '#345c24', '#5b8c3c', '#2c4d1e'],
    gulmohar: ['#4a7331', '#3d6329', '#578239', '#2f5220'],
    palm: ['#40693a', '#4f7c44', '#33562f'],
  };
  const pal = palettes[kind] ?? palettes.neem;

  const clusters = kind === 'palm' ? 9 : 200;
  for (let i = 0; i < clusters; i++) {
    const cx = S * 0.5 + (rand() - 0.5) * S * 0.86;
    const cy = S * 0.5 + (rand() - 0.5) * S * 0.86;
    const d = Math.hypot(cx - S / 2, cy - S / 2) / (S / 2);
    if (d > 0.98) continue;
    ctx.globalAlpha = Math.min(1, 1.25 - d * 0.85);
    ctx.fillStyle = pal[Math.floor(rand() * pal.length)];

    if (kind === 'palm') {
      // A frond: a long spine with leaflets.
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate((i / clusters) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(S * 0.18, -S * 0.1, S * 0.46, S * 0.02);
      ctx.quadraticCurveTo(S * 0.18, S * 0.05, 0, 0);
      ctx.fill();
      ctx.restore();
    } else {
      // A little sprig of pinnate leaves.
      const a = rand() * Math.PI * 2;
      const len = S * (0.03 + rand() * 0.05);
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.ellipse(
          cx + Math.cos(a) * k * len * 0.42,
          cy + Math.sin(a) * k * len * 0.42,
          len * 0.5, len * 0.19, a + Math.PI / 2, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Gulmohar is in flower in August in much of India.
  if (kind === 'gulmohar') {
    for (let i = 0; i < 130; i++) {
      const cx = S * 0.5 + (rand() - 0.5) * S * 0.82;
      const cy = S * 0.5 + (rand() - 0.5) * S * 0.82;
      if (Math.hypot(cx - S / 2, cy - S / 2) > S * 0.46) continue;
      ctx.fillStyle = rand() < 0.5 ? 'rgba(214,60,36,0.92)' : 'rgba(232,102,40,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + rand() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Society name board, hand-painted on the compound wall by the gate. */
export function makeGateSignTexture(name = 'SHANTI NAGAR CO-OP HSG SOCIETY') {
  const W = 1024;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  const rand = mulberry32(88);
  ctx.fillStyle = '#e6dcc2';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 30, ['rgba(150,140,120,0.25)', 'rgba(255,255,255,0.3)'], rand, 20, 90);

  ctx.strokeStyle = '#1d3f6e';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  ctx.fillStyle = '#1d3f6e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 62px Georgia, "Times New Roman", serif';
  ctx.fillText(name, W / 2, H * 0.42);
  ctx.font = '600 34px Georgia, serif';
  ctx.fillStyle = '#7a3b1e';
  ctx.fillText('EST. 1987', W / 2, H * 0.72);

  grain(ctx, W, H, 12, rand);
  return finish(c, { repeat: 1 });
}

/** The banner strung behind the dais. */
export function makeBannerTexture() {
  const W = 1600;
  const H = 320;
  const { c, ctx } = canvas(W, H);
  const rand = mulberry32(15);

  ctx.fillStyle = '#f6f1e4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FF9933';
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = '#138808';
  ctx.fillRect(0, H - 22, W, 22);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#12306a';
  ctx.font = '800 104px Georgia, "Times New Roman", serif';
  ctx.fillText('स्वतंत्रता दिवस  ·  15 अगस्त', W / 2, H * 0.37);
  ctx.fillStyle = '#8a3b18';
  ctx.font = '700 58px Georgia, serif';
  ctx.fillText('HAPPY INDEPENDENCE DAY', W / 2, H * 0.72);

  // Printed vinyl is never perfectly flat or perfectly clean.
  blotches(ctx, W, H, 24, ['rgba(160,150,130,0.14)', 'rgba(255,255,255,0.25)'], rand, 20, 120);
  grain(ctx, W, H, 9, rand);
  return finish(c, { repeat: 1 });
}
