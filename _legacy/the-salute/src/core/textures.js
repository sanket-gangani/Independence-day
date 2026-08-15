import * as THREE from 'three';

/**
 * All textures are drawn procedurally on a canvas at boot. Nothing to download,
 * nothing to license, and the tricolour comes out geometrically exact.
 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

/** Indian tricolour, 3:2, with a 24-spoke Ashoka Chakra. */
export function makeFlagTexture() {
  const W = 1200;
  const H = 800;
  const { c, ctx } = canvas(W, H);
  const band = H / 3;

  ctx.fillStyle = '#FF9933';
  ctx.fillRect(0, 0, W, band);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, band, W, band);
  ctx.fillStyle = '#138808';
  ctx.fillRect(0, band * 2, W, band);

  // Chakra: diameter is three quarters of the white band.
  const cx = W / 2;
  const cy = H / 2;
  const r = (band * 0.75) / 2;
  const navy = '#000080';

  ctx.strokeStyle = navy;
  ctx.fillStyle = navy;
  ctx.lineWidth = r * 0.055;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.115, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    // Spoke.
    ctx.lineWidth = r * 0.035;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.115, cy + Math.sin(a) * r * 0.115);
    ctx.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
    ctx.stroke();
    // Little teardrop bead between the spokes, as on the real chakra.
    const b = a + Math.PI / 24;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(b) * r * 0.8, cy + Math.sin(b) * r * 0.8, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint weave so the cloth is not a flat vector fill.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (Math.sin(x * 1.7) + Math.sin(y * 2.3)) * 3 + (Math.random() - 0.5) * 7;
      d[i] = clamp8(d[i] + n);
      d[i + 1] = clamp8(d[i + 1] + n);
      d[i + 2] = clamp8(d[i + 2] + n);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Soft round snowflake sprite. */
export function makeSnowSprite() {
  const S = 64;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft glow disc used for the sun and its halo. */
export function makeGlowSprite(inner = 'rgba(255,244,214,1)', mid = 'rgba(255,178,92,0.42)') {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, inner);
  g.addColorStop(0.18, inner);
  g.addColorStop(0.42, mid);
  g.addColorStop(1.0, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft elliptical boot print with a slight tread, used as a decal alpha map. */
export function makeFootprintTexture() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#fff';

  // Sole.
  roundedBlob(ctx, S * 0.5, S * 0.4, S * 0.19, S * 0.26);
  // Heel.
  roundedBlob(ctx, S * 0.5, S * 0.76, S * 0.155, S * 0.15);

  // Tread notches punched out of the sole.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5; i++) {
    const y = S * (0.22 + i * 0.09);
    ctx.fillRect(S * 0.31, y, S * 0.38, S * 0.022);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Blur the whole thing so it sits in the snow instead of on top of it.
  const blurred = canvas(S, S);
  blurred.ctx.filter = 'blur(3px)';
  blurred.ctx.drawImage(c, 0, 0);

  const tex = new THREE.CanvasTexture(blurred.c);
  return tex;
}

function roundedBlob(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Fine bump for the snow surface. Fed in as a normal map so the ground
 * catches the low dawn light with some grain instead of reading as plastic.
 */
export function makeSnowNormalMap() {
  const S = 512;
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      let amp = 1;
      let f = 0.06;
      for (let o = 0; o < 4; o++) {
        v += amp * (Math.sin(x * f + Math.sin(y * f * 0.7) * 2) * Math.cos(y * f * 1.3));
        amp *= 0.5;
        f *= 2.1;
      }
      h[y * S + x] = v * 0.5 + (Math.random() - 0.5) * 0.35;
    }
  }

  const { c, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const strength = 2.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)];
      const r = h[y * S + ((x + 1) % S)];
      const u = h[((y - 1 + S) % S) * S + x];
      const d = h[((y + 1) % S) * S + x];
      const nx = (l - r) * strength;
      const ny = (u - d) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(38, 38);
  return tex;
}
