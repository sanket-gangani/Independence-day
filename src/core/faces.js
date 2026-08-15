import * as THREE from 'three';

/**
 * Faces.
 *
 * A crowd stops looking like a crowd of props the moment the people have
 * faces. Every head in this scene is a small sphere with a hand-drawn face
 * painted onto it, so the audience reads as people from three metres and still
 * holds up when the camera is right next to them.
 *
 * THE PROJECTION
 * --------------
 * A sphere's own UVs put the face on a narrow vertical strip and squash it at
 * the poles, which is useless for drawing on. Instead the head geometry is
 * re-UV'd with an azimuthal projection taken from straight in front:
 *
 *     d = angle between the vertex normal and +Z   (0 at the nose, PI at the back)
 *     r = (d / PI) ^ 0.62                          (front hemisphere magnified)
 *     u = 0.5 + cos(a) * r * 0.5
 *     v = 0.5 + sin(a) * r * 0.5
 *
 * So the texture is a disc: the nose is the centre of the image, the ears sit
 * two thirds out, and the whole back of the head collapses to the rim — where
 * nothing but hair is drawn, so the singularity is invisible. The exponent
 * magnifies the front, which is the only part anyone looks at: a face ends up
 * using roughly 200 of the 512 pixels instead of 60.
 */

const SKINS = ['#f0c9a4', '#e5b489', '#d79f74', '#c98a5e', '#b3744b', '#98603c', '#7d4d30'];
const HAIRS = ['#1b1512', '#241a15', '#2f2119', '#3a2a1e', '#141010'];
const GREYS = ['#b9b3aa', '#8e8880', '#d6d1c8', '#a8a099'];

export const SKIN_TONES = SKINS;

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/**
 * A head: slightly egg-shaped, jaw tapered, with ears, carrying the face
 * projection above. Origin is at the base of the skull so it can be parented
 * straight onto a neck.
 */
export function makeHeadGeometry(radius = 0.096) {
  const geo = new THREE.SphereGeometry(1, 30, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const P = 0.62;

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Face projection, taken from the unit direction before any squashing.
    const d = Math.acos(THREE.MathUtils.clamp(v.z, -1, 1));
    const a = Math.atan2(v.y, v.x);
    const r = Math.pow(d / Math.PI, P) * 0.5;
    uv.setXY(i, 0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r);

    // Now shape it into a head rather than a ball.
    const y = v.y;
    // Jaw: pull the lower half in, more at the back than at the chin.
    const jaw = y < 0 ? 1 - Math.pow(-y, 1.7) * (0.30 - v.z * 0.10) : 1;
    // Cranium: a touch narrower at the very top.
    const crown = y > 0.55 ? 1 - (y - 0.55) * 0.18 : 1;
    v.x *= jaw * crown * 0.92;
    v.z *= jaw * crown * 0.96;
    v.y = y * 1.14 + 0.02;
    // Brow ridge / nose bridge push, so the profile is not a perfect arc.
    if (v.z > 0.35 && y > -0.2 && y < 0.45) v.z += 0.035;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.scale(radius, radius, radius);
  // Origin at the neck join.
  geo.translate(0, radius * 1.06, 0);
  geo.computeVertexNormals();

  // Ears, welded on where the projection already reserves room for them.
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.SphereGeometry(radius * 0.30, 8, 6);
    ear.scale(0.36, 1.05, 0.72);
    ear.translate(side * radius * 0.90, radius * 1.02, -radius * 0.05);
    ears.push(ear);
  }

  return { head: geo, ears };
}

/* ------------------------------------------------------------------ */
/* texture                                                             */
/* ------------------------------------------------------------------ */

const cache = new Map();

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/**
 * @param {object} f
 * @param f.skin      index into SKINS
 * @param f.hair      index into HAIRS, or -1 for grey
 * @param f.female
 * @param f.age       'child' | 'young' | 'adult' | 'elder'
 * @param f.beard     0 none, 1 stubble, 2 moustache, 3 full beard
 * @param f.bindi
 * @param f.glasses
 * @param f.hairStyle 'short' | 'crop' | 'parted' | 'bun' | 'plait' | 'open' | 'bald'
 */
export function makeFaceTexture(f) {
  const key = JSON.stringify(f);
  if (cache.has(key)) return cache.get(key);

  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const M = S / 2;

  const skin = SKINS[f.skin % SKINS.length];
  const hair = f.hair < 0 ? GREYS[(f.skin + 1) % GREYS.length] : HAIRS[f.hair % HAIRS.length];
  const skinDark = shade(skin, 0.80);
  const skinDeep = shade(skin, 0.66);
  const skinLight = shade(skin, 1.1);

  // 1. Everything starts as hair; the face is then painted into it. That way
  //    the back of the head and the rim of the projection are covered.
  ctx.fillStyle = f.hairStyle === 'bald' ? skinDark : hair;
  ctx.fillRect(0, 0, S, S);

  // 2. The face itself.
  const faceY = M - 6;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(M, faceY, f.female ? 116 : 124, f.age === 'child' ? 138 : 146, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.clip();

  // Soft modelling: temples and jaw a little darker than the centre.
  const g = ctx.createRadialGradient(M, faceY - 20, 30, M, faceY, 150);
  g.addColorStop(0, skinLight);
  g.addColorStop(0.55, skin);
  g.addColorStop(1, skinDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  // Ears (the projection puts them at ~168px out).
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(M + side * 170, faceY + 14, 26, 40, 0, 0, Math.PI * 2);
    ctx.fillStyle = skinDark;
    ctx.fill();
    ctx.restore();
  }

  // Neck shadow under the chin, so the head does not look pasted on.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = skinDeep;
  ctx.beginPath();
  ctx.ellipse(M, faceY + 150, 90, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Hairline. Painting hair back over the top of the face is what turns an
  //    oval into a person with a particular haircut.
  const hairline = (() => {
    switch (f.hairStyle) {
      case 'bald':
        return null;
      case 'crop':
        return { y: faceY - 96, curve: 26, side: 128 };
      case 'parted':
        return { y: faceY - 104, curve: 16, side: 132, part: true };
      case 'open':
      case 'plait':
      case 'bun':
        return { y: faceY - 108, curve: 30, side: 138, long: true };
      default:
        return { y: faceY - 100, curve: 22, side: 130 };
    }
  })();

  if (hairline) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(M - hairline.side, faceY + 40);
    ctx.lineTo(M - hairline.side, hairline.y + hairline.curve);
    ctx.quadraticCurveTo(M, hairline.y - hairline.curve, M + hairline.side, hairline.y + hairline.curve);
    ctx.lineTo(M + hairline.side, faceY + 40);
    ctx.lineTo(M + hairline.side + 60, faceY + 40);
    ctx.lineTo(M + hairline.side + 60, 0);
    ctx.lineTo(M - hairline.side - 60, 0);
    ctx.lineTo(M - hairline.side - 60, faceY + 40);
    ctx.closePath();
    ctx.fill();

    if (hairline.part) {
      // A side parting, drawn as a lighter sweep.
      ctx.strokeStyle = shade(hair, 1.5);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(M - 46, hairline.y + 4);
      ctx.quadraticCurveTo(M + 20, hairline.y + 26, M + 120, hairline.y + 46);
      ctx.stroke();
    }
    if (hairline.long) {
      // Hair falling past the ears on both sides.
      ctx.fillStyle = hair;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(M + side * 118, faceY - 80);
        ctx.quadraticCurveTo(M + side * 186, faceY + 30, M + side * 150, faceY + 190);
        ctx.lineTo(M + side * 230, faceY + 210);
        ctx.lineTo(M + side * 230, faceY - 120);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Sheen, so the hair is not a flat silhouette.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(M - 40, hairline.y - 26, 74, 20, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Brows.
  const browY = faceY - 52;
  ctx.strokeStyle = f.hair < 0 ? shade(hair, 0.75) : shade(hair, 1.2);
  ctx.lineCap = 'round';
  ctx.lineWidth = f.female ? 7 : 11;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(M + side * 26, browY + 6);
    ctx.quadraticCurveTo(M + side * 62, browY - (f.female ? 12 : 8), M + side * 96, browY + 4);
    ctx.stroke();
  }

  // 5. Eyes.
  const eyeY = faceY - 16;
  for (const side of [-1, 1]) {
    const ex = M + side * 62;

    // Socket shadow.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = skinDeep;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - 4, 40, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Almond opening.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - 32, eyeY + 1);
    ctx.quadraticCurveTo(ex, eyeY - 22, ex + 32, eyeY + 1);
    ctx.quadraticCurveTo(ex, eyeY + 17, ex - 32, eyeY + 1);
    ctx.closePath();
    ctx.fillStyle = '#f6f1ea';
    ctx.fill();
    ctx.clip();
    // Iris and pupil.
    ctx.fillStyle = '#3d2a1c';
    ctx.beginPath();
    ctx.arc(ex + side * 2, eyeY - 1, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120c08';
    ctx.beginPath();
    ctx.arc(ex + side * 2, eyeY - 1, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(ex + side * 2 - 5, eyeY - 6, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Lash line and lower lid.
    ctx.strokeStyle = 'rgba(28,18,12,0.9)';
    ctx.lineWidth = f.female ? 5 : 3.6;
    ctx.beginPath();
    ctx.moveTo(ex - 32, eyeY + 1);
    ctx.quadraticCurveTo(ex, eyeY - 22, ex + 32, eyeY + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,40,28,0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(ex - 26, eyeY + 6);
    ctx.quadraticCurveTo(ex, eyeY + 16, ex + 28, eyeY + 4);
    ctx.stroke();
  }

  // 6. Nose — shadow down one side and a soft tip, no outline.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = skinDeep;
  ctx.beginPath();
  ctx.moveTo(M - 12, faceY - 30);
  ctx.quadraticCurveTo(M - 22, faceY + 16, M - 26, faceY + 40);
  ctx.quadraticCurveTo(M - 6, faceY + 50, M + 4, faceY + 42);
  ctx.quadraticCurveTo(M - 2, faceY + 8, M - 2, faceY - 28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = skinLight;
  ctx.beginPath();
  ctx.ellipse(M + 5, faceY + 30, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(40,24,16,0.45)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(M + side * 17, faceY + 44, 6, 4, side * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Mouth — everyone here is at least half smiling.
  const mouthY = faceY + 92;
  ctx.save();
  ctx.fillStyle = f.female ? '#a8564f' : shade(skin, 0.62);
  ctx.beginPath();
  ctx.moveTo(M - 42, mouthY);
  ctx.quadraticCurveTo(M - 20, mouthY - 12, M, mouthY - 6);
  ctx.quadraticCurveTo(M + 20, mouthY - 12, M + 42, mouthY);
  ctx.quadraticCurveTo(M + 18, mouthY + 26, M, mouthY + 26);
  ctx.quadraticCurveTo(M - 18, mouthY + 26, M - 42, mouthY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,28,22,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(M - 40, mouthY + 1);
  ctx.quadraticCurveTo(M, mouthY + 14, M + 40, mouthY + 1);
  ctx.stroke();

  // Cheeks.
  ctx.save();
  ctx.globalAlpha = f.age === 'child' ? 0.22 : 0.12;
  ctx.fillStyle = '#c4645a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(M + side * 84, faceY + 44, 34, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 8. Facial hair.
  if (f.beard >= 2) {
    ctx.fillStyle = f.hair < 0 ? shade(hair, 0.9) : shade(hair, 1.05);
    ctx.beginPath();
    ctx.moveTo(M - 46, mouthY - 16);
    ctx.quadraticCurveTo(M, mouthY - 30, M + 46, mouthY - 16);
    ctx.quadraticCurveTo(M + 24, mouthY - 2, M, mouthY - 5);
    ctx.quadraticCurveTo(M - 24, mouthY - 2, M - 46, mouthY - 16);
    ctx.fill();
  }
  if (f.beard === 3) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = f.hair < 0 ? shade(hair, 0.95) : shade(hair, 1.0);
    ctx.beginPath();
    ctx.moveTo(M - 118, faceY + 20);
    ctx.quadraticCurveTo(M - 108, faceY + 150, M, faceY + 162);
    ctx.quadraticCurveTo(M + 108, faceY + 150, M + 118, faceY + 20);
    ctx.quadraticCurveTo(M + 70, faceY + 96, M, faceY + 96);
    ctx.quadraticCurveTo(M - 70, faceY + 96, M - 118, faceY + 20);
    ctx.fill();
    ctx.restore();
  } else if (f.beard === 1) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(M, faceY + 96, 96, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 9. Age lines.
  if (f.age === 'elder') {
    ctx.strokeStyle = 'rgba(70,44,28,0.28)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(M - 74, faceY - 96 + i * 15);
      ctx.quadraticCurveTo(M, faceY - 104 + i * 15, M + 74, faceY - 96 + i * 15);
      ctx.stroke();
    }
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(M + side * 44, faceY + 40);
      ctx.quadraticCurveTo(M + side * 58, faceY + 74, M + side * 46, faceY + 104);
      ctx.stroke();
    }
  }

  // 10. Bindi.
  if (f.bindi) {
    ctx.fillStyle = '#a01f2c';
    ctx.beginPath();
    ctx.arc(M, faceY - 84, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sindoor along the parting.
  if (f.female && f.bindi && f.age !== 'child' && hairline) {
    ctx.strokeStyle = '#a8202b';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(M, hairline.y + 2);
    ctx.lineTo(M, hairline.y - 40);
    ctx.stroke();
  }

  // 11. Spectacles.
  if (f.glasses) {
    ctx.strokeStyle = 'rgba(38,30,24,0.85)';
    ctx.lineWidth = 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(M + side * 62, eyeY - 2, 44, 34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(M - 18, eyeY - 6);
    ctx.quadraticCurveTo(M, eyeY - 14, M + 18, eyeY - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(M - 106, eyeY - 6);
    ctx.lineTo(M - 160, eyeY - 16);
    ctx.moveTo(M + 106, eyeY - 6);
    ctx.lineTo(M + 160, eyeY - 16);
    ctx.stroke();
  }

  // 12. Skin grain, so it is not a flat vector illustration.
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const matCache = new Map();

/** One shared material per distinct face, so a crowd is a handful of them. */
export function faceMaterial(f) {
  const key = JSON.stringify(f);
  if (matCache.has(key)) return matCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    map: makeFaceTexture(f),
    roughness: 0.78,
    metalness: 0,
  });
  matCache.set(key, mat);
  return mat;
}
