import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/rng.js';
import {
  makeWallTexture,
  makeWindowTexture,
  makeConcreteTexture,
  makeBarkTexture,
  makeLeafTexture,
  makeGateSignTexture,
} from '../core/textures.js';

/**
 * The society.
 *
 * This is the single biggest reason the scene reads as India rather than as a
 * 3D demo, so it is modelled rather than suggested: four- and five-storey
 * blocks with projecting balconies, safety grilles, monsoon streaks down the
 * distemper, stilt parking underneath, black Sintex water tanks and a dish on
 * every roof, staircase towers with their tall strip windows, a compound wall,
 * a sliding gate with a painted name board and a watchman's cabin, neem and
 * gulmohar, scooters parked in a crooked row, and cables slung between the
 * street lights.
 *
 * Deliberate irregularities: no two blocks are the same height, the balconies
 * are not aligned across blocks, half the balconies have washing out and the
 * other half have plants, the scooters are parked at slightly different
 * angles. Perfect repetition is what makes procedural architecture look
 * procedural.
 *
 * COST
 * ----
 * Everything is emitted into per-material bins, transformed into world space,
 * and merged once at the end. The entire society — seven blocks, the wall, the
 * gate, thirty vehicles and forty trees — is about twenty draw calls.
 */

const FLOOR_H = 3.0;

/** Collects geometry per material, then merges each bin into one mesh. */
function bins() {
  const map = new Map();
  return {
    add(mat, geo, matrix) {
      if (matrix) geo.applyMatrix4(matrix);
      if (!map.has(mat)) map.set(mat, []);
      map.get(mat).push(geo);
    },
    build(parent, { shadows = true } = {}) {
      for (const [mat, list] of map) {
        if (!list.length) continue;
        const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        parent.add(mesh);
      }
      map.clear();
    },
  };
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function plane(w, h, x, y, z, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function createSociety(scene) {
  const group = new THREE.Group();
  group.name = 'society';
  const r = rng(815);
  const B = bins();

  /* --- materials -------------------------------------------------------- */

  const wallTex = makeWallTexture('#ffffff', 512, 5);
  const WALL_COLORS = [0xe9dcc0, 0xdfd3bb, 0xe6d7c8, 0xd6cfc0, 0xe4dccb, 0xdcd0ae, 0xd2d6cf];
  const wallMats = WALL_COLORS.map((c) => {
    const t = wallTex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({ map: t, color: c, roughness: 0.97, metalness: 0 });
  });

  const concreteTex = makeConcreteTexture();
  const slabMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xcfc9bc, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xa9382c, roughness: 0.85 }); // painted plinth band
  const railMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.55, metalness: 0.45 });
  const railPaintMat = new THREE.MeshStandardMaterial({ color: 0x7e8b93, roughness: 0.7, metalness: 0.2 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.75 });
  const tankBlackMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.72 });
  const tankBlueMat = new THREE.MeshStandardMaterial({ color: 0x2f5f8c, roughness: 0.72 });
  const clothMats = [0xdfe6ec, 0xe8d6c0, 0xc8586a, 0x6b8fb5, 0xe4e0d2, 0x8fae7c, 0xd6a44c].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide })
  );
  // Small flags hung off balcony rails this morning.
  const tricolourMats = [0xff9933, 0xf4f2ea, 0x138808].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide })
  );

  const glassMats = [0, 1, 2, 3].map(
    (i) =>
      new THREE.MeshStandardMaterial({
        map: makeWindowTexture(256, 3 + i * 7),
        roughness: 0.28,
        metalness: 0.05,
      })
  );

  /* --- one apartment block ---------------------------------------------- */

  function block({ x, z, w, d, floors, wallIndex, stilts, seedBump }) {
    const rot = Math.atan2(-x, -z);
    const M = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
    const wallMat = wallMats[wallIndex % wallMats.length];
    const rb = rng(1000 + seedBump);

    const H = floors * FLOOR_H;
    const hw = w / 2;
    const hd = d / 2;

    // Shell. Modelled as six faces rather than a box so the front can be
    // pushed and pulled without disturbing the rest.
    B.add(wallMat, box(w, H, d, 0, H / 2, 0), M.clone());

    // Plinth band, and the painted skirting every Indian block has.
    B.add(slabMat, box(w + 0.5, 0.55, d + 0.5, 0, 0.27, 0), M.clone());
    B.add(trimMat, box(w + 0.54, 0.34, d + 0.54, 0, 0.72, 0), M.clone());

    // Floor slabs read as horizontal lines across the facade.
    for (let f = 1; f <= floors; f++) {
      B.add(slabMat, box(w + 0.32, 0.22, d + 0.32, 0, f * FLOOR_H, 0), M.clone());
    }

    // Parapet.
    const par = 1.0;
    B.add(wallMat, box(w + 0.34, par, 0.24, 0, H + par / 2, hd + 0.05), M.clone());
    B.add(wallMat, box(w + 0.34, par, 0.24, 0, H + par / 2, -hd - 0.05), M.clone());
    B.add(wallMat, box(0.24, par, d + 0.34, hw + 0.05, H + par / 2, 0), M.clone());
    B.add(wallMat, box(0.24, par, d + 0.34, -hw - 0.05, H + par / 2, 0), M.clone());
    B.add(slabMat, box(w + 0.5, 0.12, d + 0.5, 0, H + par, 0), M.clone());

    // --- front facade: bays of window / balcony ---
    const bays = Math.max(3, Math.round(w / 4.2));
    const bayW = w / bays;
    const stiltFloors = stilts ? 1 : 0;

    for (let f = 0; f < floors; f++) {
      const y = f * FLOOR_H;
      for (let b = 0; b < bays; b++) {
        const bx = -hw + bayW * (b + 0.5);
        const isStilt = f < stiltFloors;

        if (isStilt) {
          // Open parking underneath: columns instead of a wall.
          if (b === 0) {
            B.add(wallMat, box(w, FLOOR_H, 0.5, 0, y + FLOOR_H / 2, -hd + 0.25), M.clone());
            for (let ci = 0; ci <= bays; ci++) {
              const cxp = -hw + bayW * ci;
              B.add(slabMat, box(0.42, FLOOR_H, 0.42, cxp, y + FLOOR_H / 2, hd - 0.3), M.clone());
            }
            // Recess the ground floor so the columns stand proud.
            B.add(wallMat, box(w - 0.1, FLOOR_H - 0.3, 0.3, 0, y + FLOOR_H / 2, hd - 0.9), M.clone());
          }
          continue;
        }

        // A balcony on roughly half the bays, staggered floor to floor.
        const balcony = (b + f) % 2 === 0 && b !== 0;

        if (balcony) {
          const bd = 1.35;
          const bw = bayW - 0.35;
          // Slab.
          B.add(slabMat, box(bw, 0.18, bd, bx, y + 0.9, hd + bd / 2), M.clone());
          // Railing: top rail, bottom rail, and bars.
          const bh = 1.02;
          const railY = y + 0.9 + bh;
          const rm = rb() < 0.5 ? railMat : railPaintMat;
          B.add(rm, box(bw, 0.07, 0.07, bx, railY, hd + bd), M.clone());
          B.add(rm, box(0.07, bh, 0.07, bx - bw / 2, railY - bh / 2, hd + bd), M.clone());
          B.add(rm, box(0.07, bh, 0.07, bx + bw / 2, railY - bh / 2, hd + bd), M.clone());
          B.add(rm, box(0.07, 0.07, bd, bx - bw / 2, railY, hd + bd / 2), M.clone());
          B.add(rm, box(0.07, 0.07, bd, bx + bw / 2, railY, hd + bd / 2), M.clone());
          const bars = Math.round(bw / 0.16);
          for (let i = 1; i < bars; i++) {
            const px = bx - bw / 2 + (i / bars) * bw;
            B.add(rm, box(0.032, bh - 0.05, 0.032, px, railY - bh / 2 - 0.02, hd + bd), M.clone());
          }
          const sideBars = Math.round(bd / 0.16);
          for (const side of [-1, 1]) {
            for (let i = 1; i < sideBars; i++) {
              const pz = hd + (i / sideBars) * bd;
              B.add(rm, box(0.032, bh - 0.05, 0.032, bx + side * bw / 2, railY - bh / 2 - 0.02, pz), M.clone());
            }
          }
          // Door out onto it.
          B.add(glassMats[(b + f) % 4], plane(1.0, 2.0, bx, y + 1.9, hd + 0.03), M.clone());
          B.add(doorMat, box(1.16, 2.16, 0.09, bx, y + 1.9, hd + 0.01), M.clone());

          // What is actually on the balcony this morning.
          const use = rb();
          if (use < 0.42) {
            // Washing on a line.
            for (let i = 0; i < 3; i++) {
              const cw = 0.34 + rb() * 0.26;
              const ch = 0.5 + rb() * 0.5;
              B.add(
                clothMats[Math.floor(rb() * clothMats.length)],
                plane(cw, ch, bx - bw / 3 + (i * bw) / 3.2, y + 1.72 - ch / 2, hd + 0.5 + rb() * 0.5),
                M.clone()
              );
            }
            B.add(railMat, box(bw * 0.9, 0.02, 0.02, bx, y + 1.76, hd + 0.7), M.clone());
          } else if (use < 0.72) {
            // Potted plants along the rail.
            for (let i = 0; i < 2 + Math.floor(rb() * 2); i++) {
              const px = bx - bw / 2 + 0.25 + rb() * (bw - 0.5);
              const pz = hd + 0.3 + rb() * (bd - 0.6);
              B.add(trimMat, new THREE.CylinderGeometry(0.11, 0.08, 0.2, 8).translate(px, y + 1.1, pz), M.clone());
              // Sphere rather than icosahedron: polyhedra come back non-indexed
              // and cannot be merged with the indexed geometry around them.
              const leaf = new THREE.SphereGeometry(0.17, 6, 4);
              leaf.translate(px, y + 1.3, pz);
              B.add(clothMats[5], leaf, M.clone());
            }
          }
          // Tricolour on some balconies — it is the fifteenth, after all.
          if (rb() < 0.3) {
            for (let i = 0; i < 3; i++) {
              B.add(
                tricolourMats[i],
                plane(0.62, 0.14, bx + bw * 0.25, y + 1.86 - i * 0.14, hd + bd + 0.02),
                M.clone()
              );
            }
          }
        } else {
          // A window, with a sill and a chajja (the little concrete eyebrow
          // over every Indian window).
          const ww = Math.min(1.7, bayW * 0.6);
          const wh = 1.35;
          B.add(glassMats[(b * 3 + f) % 4], plane(ww, wh, bx, y + 1.75, hd + 0.04), M.clone());
          B.add(slabMat, box(ww + 0.3, 0.1, 0.3, bx, y + 1.05, hd + 0.12), M.clone());
          B.add(slabMat, box(ww + 0.44, 0.12, 0.42, bx, y + 2.5, hd + 0.18), M.clone());
          // Split AC unit outside a few of them.
          if (rb() < 0.22) {
            B.add(slabMat, box(0.78, 0.5, 0.32, bx + ww * 0.7, y + 1.5, hd + 0.2), M.clone());
          }
        }
      }
    }

    // --- sides and back: plain windows ---
    for (let f = stiltFloors; f < floors; f++) {
      const y = f * FLOOR_H;
      const nBack = Math.max(2, Math.round(w / 5));
      for (let i = 0; i < nBack; i++) {
        const bx = -hw + (w / nBack) * (i + 0.5);
        B.add(glassMats[(i + f) % 4], plane(1.2, 1.2, bx, y + 1.75, -hd - 0.04, Math.PI), M.clone());
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const pz = -hd + (d / 2) * (i + 0.5);
          B.add(
            glassMats[(i + f + 2) % 4],
            plane(1.0, 1.2, side * (hw + 0.04), y + 1.75, pz, (side * Math.PI) / 2),
            M.clone()
          );
        }
      }
    }

    // --- staircase tower ---
    const towerX = -hw + 0.9 + rb() * (w - 1.8);
    const tw = 2.6;
    B.add(wallMat, box(tw, H + 1.6, 1.5, towerX, (H + 1.6) / 2, hd + 0.55), M.clone());
    // Strip window running the full height of it.
    B.add(glassMats[1], plane(1.5, H - 1.2, towerX, H / 2 + 0.6, hd + 1.32), M.clone());
    B.add(slabMat, box(tw + 0.3, 0.16, 1.8, towerX, H + 1.6, hd + 0.55), M.clone());
    // Entrance and name plate at the bottom.
    B.add(doorMat, box(1.3, 2.3, 0.12, towerX, 1.15, hd + 1.32), M.clone());
    B.add(slabMat, box(1.1, 0.42, 0.08, towerX, 2.85, hd + 1.33), M.clone());

    // --- roof clutter ---
    // Overhead tanks on their stands, a stair headroom box, a dish or two.
    const tanks = 2 + Math.floor(rb() * 3);
    for (let i = 0; i < tanks; i++) {
      const tx = -hw + 1.4 + rb() * (w - 2.8);
      const tz = -hd + 1.4 + rb() * (d - 2.8);
      const th = 1.0 + rb() * 0.5;
      const trad = 0.55 + rb() * 0.25;
      const stand = 0.5 + rb() * 0.5;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        B.add(railMat, box(0.09, stand, 0.09, tx + sx * trad * 0.6, H + par + stand / 2, tz + sz * trad * 0.6), M.clone());
      }
      const tank = new THREE.CylinderGeometry(trad, trad * 0.94, th, 14);
      tank.translate(tx, H + par + stand + th / 2, tz);
      B.add(rb() < 0.6 ? tankBlackMat : tankBlueMat, tank, M.clone());
      const lid = new THREE.CylinderGeometry(trad * 0.32, trad * 0.32, 0.12, 10);
      lid.translate(tx, H + par + stand + th + 0.06, tz);
      B.add(railMat, lid, M.clone());
    }
    B.add(wallMat, box(2.4, 2.3, 2.0, towerX, H + par + 1.15, hd + 0.4), M.clone());
    B.add(slabMat, box(2.7, 0.14, 2.3, towerX, H + par + 2.3, hd + 0.4), M.clone());
    // Dish antenna.
    for (let i = 0; i < 1 + Math.floor(rb() * 2); i++) {
      const dish = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, 0.9);
      dish.rotateX(-2.2);
      dish.translate(-hw + 1 + rb() * (w - 2), H + par + 0.7, -hd + 1 + rb() * (d - 2));
      B.add(slabMat, dish, M.clone());
    }
    // A water pipe running down the back.
    B.add(railMat, new THREE.CylinderGeometry(0.09, 0.09, H, 8).translate(hw - 0.6, H / 2, -hd - 0.15), M.clone());

    return { x, z, w, d, rot, H };
  }

  const BLOCKS = [
    { x: 0, z: -40, w: 30, d: 13, floors: 5, wallIndex: 0, stilts: true, seedBump: 1 },
    { x: -34, z: -24, w: 26, d: 12, floors: 4, wallIndex: 1, stilts: false, seedBump: 2 },
    { x: 35, z: -22, w: 24, d: 12, floors: 4, wallIndex: 2, stilts: true, seedBump: 3 },
    { x: -42, z: 10, w: 24, d: 12, floors: 5, wallIndex: 3, stilts: false, seedBump: 4 },
    { x: 42, z: 12, w: 26, d: 12, floors: 3, wallIndex: 4, stilts: true, seedBump: 5 },
    { x: -22, z: 44, w: 22, d: 12, floors: 4, wallIndex: 5, stilts: false, seedBump: 6 },
    { x: 24, z: 44, w: 20, d: 12, floors: 3, wallIndex: 6, stilts: true, seedBump: 7 },
  ];
  const built = BLOCKS.map(block);

  /* --- compound wall and gate ------------------------------------------- */

  const wallH = 2.1;
  const compound = 58;
  const wallMat = wallMats[2];

  // Wall runs all the way round except where the gate is.
  const segs = 64;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // Gap for the gate at +Z.
    if (Math.abs(Math.atan2(Math.sin(a0), Math.cos(a0)) - Math.PI / 2) < 0.09) continue;
    const x0 = Math.sin(a0) * compound;
    const z0 = Math.cos(a0) * compound;
    const x1 = Math.sin(a1) * compound;
    const z1 = Math.cos(a1) * compound;
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.1;
    const mid = new THREE.Matrix4()
      .makeRotationY(Math.atan2(x1 - x0, z1 - z0))
      .setPosition((x0 + x1) / 2, 0, (z0 + z1) / 2);
    B.add(wallMat, box(0.3, wallH, len, 0, wallH / 2, 0), mid.clone());
    B.add(trimMat, box(0.36, 0.5, len, 0, 0.25, 0), mid.clone());
    B.add(slabMat, box(0.44, 0.14, len, 0, wallH + 0.07, 0), mid.clone());
    if (i % 4 === 0) {
      B.add(slabMat, box(0.46, wallH + 0.5, 0.46, 0, (wallH + 0.5) / 2, -len / 2), mid.clone());
    }
  }

  // The gate itself.
  const gateZ = compound;
  for (const side of [-1, 1]) {
    B.add(slabMat, box(0.8, 3.4, 0.8, side * 3.0, 1.7, gateZ));
    B.add(trimMat, box(0.92, 0.28, 0.92, side * 3.0, 3.5, gateZ));
  }
  // Sliding grille.
  for (let i = 0; i < 22; i++) {
    B.add(railMat, box(0.06, 2.2, 0.06, -2.6 + i * 0.25, 1.1, gateZ));
  }
  B.add(railMat, box(5.4, 0.1, 0.1, 0, 2.2, gateZ));
  B.add(railMat, box(5.4, 0.1, 0.1, 0, 0.25, gateZ));
  // Arch and the painted name board.
  B.add(slabMat, box(7.4, 0.5, 0.6, 0, 3.9, gateZ));
  const signMat = new THREE.MeshStandardMaterial({ map: makeGateSignTexture(), roughness: 0.9 });
  B.add(signMat, plane(6.4, 1.6, 0, 4.95, gateZ - 0.02, Math.PI));
  B.add(slabMat, box(6.8, 1.9, 0.24, 0, 4.95, gateZ + 0.06));

  // Watchman's cabin.
  B.add(wallMat, box(2.2, 2.5, 2.0, 5.2, 1.25, gateZ - 1.0));
  B.add(slabMat, box(2.6, 0.16, 2.4, 5.2, 2.55, gateZ - 1.0));
  B.add(glassMats[0], plane(1.4, 1.0, 5.2, 1.6, gateZ - 2.02, Math.PI));
  B.add(doorMat, box(0.8, 1.9, 0.08, 6.32, 0.95, gateZ - 1.0));

  /* --- street lights and cables ----------------------------------------- */

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf0e2c0,
    roughness: 0.4,
    emissive: 0x2a1e0c,
    emissiveIntensity: 1,
  });
  const poleTops = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const rad = 27.5;
    const x = Math.sin(a) * rad;
    const z = Math.cos(a) * rad;
    const h = 6.2;
    B.add(railMat, new THREE.CylinderGeometry(0.09, 0.13, h, 8).translate(x, h / 2, z));
    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    const arm = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
    arm.rotateZ(Math.PI / 2);
    arm.translate(x + inward.x * 0.7, h - 0.15, z + inward.z * 0.7);
    B.add(railMat, arm);
    const lamp = new THREE.BoxGeometry(0.5, 0.16, 0.3);
    lamp.translate(x + inward.x * 1.35, h - 0.28, z + inward.z * 1.35);
    B.add(lampMat, lamp);
    poleTops.push(new THREE.Vector3(x, h - 0.5, z));
  }
  // Cables slung pole to pole and sagging — instantly reads as an Indian street.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.9 });
  for (let i = 0; i < poleTops.length; i++) {
    const a = poleTops[i];
    const b = poleTops[(i + 1) % poleTops.length];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let t = 0; t <= 8; t++) {
        const f = t / 8;
        const p = a.clone().lerp(b, f);
        p.y -= Math.sin(f * Math.PI) * (1.1 + k * 0.16);
        p.y -= k * 0.18;
        pts.push(p);
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 4, false);
      B.add(cableMat, tube);
    }
  }

  /* --- vehicles ---------------------------------------------------------- */

  const bodyMats = [0xb8bcc0, 0x8f2f2c, 0x2f4460, 0x3b3f44, 0xd8d4c8, 0x2e6b52, 0xc4a03a].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.35 })
  );
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.94 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb6bcc2, roughness: 0.28, metalness: 0.85 });

  function scooter(x, z, ry, colorIdx, bike) {
    const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    const mat = bodyMats[colorIdx % bodyMats.length];
    const wheelR = bike ? 0.31 : 0.22;
    for (const wz of [-0.58, 0.58]) {
      const wheel = new THREE.CylinderGeometry(wheelR, wheelR, 0.11, 14);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(0, wheelR, wz);
      B.add(tyreMat, wheel, M.clone());
      const hub = new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.13, 10);
      hub.rotateZ(Math.PI / 2);
      hub.translate(0, wheelR, wz);
      B.add(chromeMat, hub, M.clone());
    }
    if (bike) {
      B.add(mat, box(0.26, 0.3, 0.5, 0, 0.62, 0.05), M.clone());
      B.add(tyreMat, box(0.3, 0.12, 0.55, 0, 0.72, -0.32), M.clone());
      B.add(chromeMat, box(0.24, 0.26, 0.34, 0, 0.42, 0.16), M.clone());
    } else {
      // Scooter: step-through floor and a fat rear body.
      B.add(mat, box(0.3, 0.16, 0.72, 0, 0.28, 0.05), M.clone());
      B.add(mat, box(0.34, 0.42, 0.5, 0, 0.55, -0.28), M.clone());
      B.add(tyreMat, box(0.3, 0.1, 0.42, 0, 0.77, -0.3), M.clone());
      B.add(mat, box(0.3, 0.5, 0.22, 0, 0.55, 0.52), M.clone());
    }
    // Handlebar, mirrors, headlamp.
    B.add(chromeMat, box(0.62, 0.05, 0.05, 0, 0.98, 0.5), M.clone());
    for (const side of [-1, 1]) {
      B.add(chromeMat, box(0.04, 0.16, 0.04, side * 0.3, 1.06, 0.5), M.clone());
      const mirror = new THREE.CircleGeometry(0.06, 8);
      mirror.translate(side * 0.3, 1.15, 0.51);
      B.add(chromeMat, mirror, M.clone());
    }
    B.add(chromeMat, new THREE.SphereGeometry(0.1, 10, 8).translate(0, 0.86, 0.62), M.clone());
    // Stand, so it leans very slightly like a parked two-wheeler does.
    B.add(tyreMat, box(0.04, 0.3, 0.04, -0.17, 0.15, -0.1), M.clone());
  }

  // A crooked row of two-wheelers along the courtyard edge.
  for (let i = 0; i < 11; i++) {
    scooter(-15.6 + i * 2.45 + r.range(-0.2, 0.2), -13.4 + r.range(-0.35, 0.35), Math.PI / 2 + r.range(-0.16, 0.16), i, r.chance(0.4));
  }
  // And a few more scattered by the stilts.
  for (let i = 0; i < 5; i++) {
    const a = r.range(2.2, 3.6);
    scooter(Math.sin(a) * 22, Math.cos(a) * 22, a + r.range(-0.4, 0.4), i + 3, r.chance(0.5));
  }

  /**
   * A small hatchback — the kind parked in every society.
   *
   * Built as a lathe-like profile swept across the width rather than as
   * stacked boxes: a bonnet that slopes down to the grille, a raked
   * windscreen, a roof, and a tail that drops away. Three boxes on wheels is
   * the single most obvious "programmer made this" object in a scene, because
   * cars are the one shape everybody can draw from memory.
   */
  /**
   * A small hatchback, swept from a single side profile.
   *
   * Every surface — body, glass, roof — is generated from the same station
   * list, so the windscreen physically sits on the scuttle and the side glass
   * sits on the beltline instead of hovering alongside the car. Separate
   * window planes positioned by eye is what made the first attempt look like a
   * cardboard box with stickers on it.
   *
   * Stations run nose (+z) to tail (-z): [z, roofline, beltline, sill].
   * Where roofline === beltline there is no glass at that station, which is
   * how the bonnet and the boot come out solid.
   */
  function carShell(len, width, colour) {
    const BELT = 1.03;
    const stations = [
      [1.98, 0.66, 0.66, 0.44],
      [1.90, 0.80, 0.80, 0.34],
      [1.56, 0.86, 0.86, 0.30],
      [1.20, 0.89, 0.89, 0.30], // bonnet
      [0.86, 0.95, 0.95, 0.30], // scuttle
      [0.60, 1.28, BELT, 0.30], // windscreen base
      [0.24, 1.44, BELT, 0.30], // roof front
      [-0.72, 1.45, BELT, 0.30], // roof rear
      [-1.16, 1.30, BELT, 0.32], // rear screen
      [-1.52, 1.00, 1.00, 0.34],
      [-1.84, 0.86, 0.86, 0.42],
      [-1.98, 0.70, 0.70, 0.52],
    ];

    const s = len / 3.96;
    const hw = width / 2;
    const body = { pos: [], idx: [] };
    const glass = { pos: [], idx: [] };

    const rings = stations.map(([z, roof, belt, sill]) => {
      const taper = 1 - Math.pow(Math.abs(z / 2.0), 3) * 0.34;
      const w = hw * taper;
      return {
        z: z * s,
        roof: roof * s,
        belt: belt * s,
        sill: sill * s,
        w,
        cabinW: w * 0.9,
        glazed: roof > belt + 0.001,
      };
    });

    const push = (t, x, y, z) => {
      t.pos.push(x, y, z);
      return t.pos.length / 3 - 1;
    };
    const quad = (t, a, b, c, d) => t.idx.push(a, b, c, a, c, d);
    const Y = 0.02;

    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i];
      const C = rings[i + 1];

      // Lower body: sill up to the beltline on both flanks, plus the floor.
      for (const side of [-1, 1]) {
        const a = push(body, side * A.w, A.sill + Y, A.z);
        const b = push(body, side * A.w, A.belt + Y, A.z);
        const c = push(body, side * C.w, C.belt + Y, C.z);
        const d = push(body, side * C.w, C.sill + Y, C.z);
        if (side < 0) quad(body, a, b, c, d);
        else quad(body, d, c, b, a);
      }
      const u0 = push(body, -A.w, A.sill + Y, A.z);
      const u1 = push(body, A.w, A.sill + Y, A.z);
      const u2 = push(body, C.w, C.sill + Y, C.z);
      const u3 = push(body, -C.w, C.sill + Y, C.z);
      quad(body, u0, u3, u2, u1);

      if (!A.glazed && !C.glazed) {
        // Solid deck across the top: bonnet or boot lid.
        const t0 = push(body, -A.w, A.roof + Y, A.z);
        const t1 = push(body, A.w, A.roof + Y, A.z);
        const t2 = push(body, C.w, C.roof + Y, C.z);
        const t3 = push(body, -C.w, C.roof + Y, C.z);
        quad(body, t0, t1, t2, t3);
      } else {
        // Greenhouse: glass from the beltline to the roofline, then the roof.
        for (const side of [-1, 1]) {
          const a = push(glass, side * A.cabinW, A.belt + Y, A.z);
          const b = push(glass, side * A.cabinW, A.roof + Y, A.z);
          const c = push(glass, side * C.cabinW, C.roof + Y, C.z);
          const d = push(glass, side * C.cabinW, C.belt + Y, C.z);
          if (side < 0) quad(glass, a, b, c, d);
          else quad(glass, d, c, b, a);
        }
        const r0 = push(body, -A.cabinW, A.roof + Y, A.z);
        const r1 = push(body, A.cabinW, A.roof + Y, A.z);
        const r2 = push(body, C.cabinW, C.roof + Y, C.z);
        const r3 = push(body, -C.cabinW, C.roof + Y, C.z);
        quad(body, r0, r1, r2, r3);
        // Close the sliver between the full body width and the inset cabin.
        for (const side of [-1, 1]) {
          const a = push(body, side * A.w, A.belt + Y, A.z);
          const b = push(body, side * A.cabinW, A.belt + Y, A.z);
          const c = push(body, side * C.cabinW, C.belt + Y, C.z);
          const d = push(body, side * C.w, C.belt + Y, C.z);
          if (side < 0) quad(body, a, d, c, b);
          else quad(body, b, c, d, a);
        }
      }
    }

    const build = (t) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
      g.setIndex(t.idx);
      g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((t.pos.length / 3) * 2), 2));
      return g;
    };
    return [
      { mat: colour, geo: build(body) },
      { mat: glassMats[2], geo: build(glass) },
    ];
  }

  function car(x, z, ry, colorIdx) {
    const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    const mat = bodyMats[colorIdx % bodyMats.length];
    const width = 1.66;

    for (const shell of carShell(3.86, width, mat)) B.add(shell.mat, shell.geo, M.clone());

    // Wheels, tucked just inside the flanks so the car sits on them rather
    // than beside them.
    for (const [wx, wz] of [[-0.72, 1.18], [0.72, 1.18], [-0.72, -1.18], [0.72, -1.18]]) {
      const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 16);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(wx, 0.3, wz);
      B.add(tyreMat, wheel, M.clone());
      const hub = new THREE.CylinderGeometry(0.165, 0.165, 0.2, 10);
      hub.rotateZ(Math.PI / 2);
      hub.translate(wx, 0.3, wz);
      B.add(chromeMat, hub, M.clone());
    }

    for (const side of [-1, 1]) {
      B.add(mat, box(0.15, 0.085, 0.06, side * 0.87, 1.02, 0.5), M.clone()); // mirror
      B.add(tyreMat, box(0.014, 0.4, 0.016, side * 0.812, 0.7, -0.2), M.clone()); // shut line
      B.add(chromeMat, box(0.03, 0.045, 0.17, side * 0.815, 0.88, -0.46), M.clone());
      B.add(chromeMat, box(0.03, 0.045, 0.17, side * 0.815, 0.88, 0.36), M.clone());
      B.add(tyreMat, box(0.05, 0.1, 2.1, side * 0.78, 0.36, -0.05), M.clone()); // sill skirt
    }

    // Bumpers, lights, plate.
    B.add(tyreMat, box(width * 0.94, 0.2, 0.16, 0, 0.5, 1.93), M.clone());
    B.add(tyreMat, box(width * 0.94, 0.2, 0.16, 0, 0.52, -1.93), M.clone());
    B.add(chromeMat, box(0.86, 0.09, 0.05, 0, 0.72, 1.94), M.clone());
    for (const side of [-1, 1]) {
      const lamp = new THREE.BoxGeometry(0.28, 0.12, 0.07);
      lamp.translate(side * 0.5, 0.79, 1.91);
      B.add(lampMat, lamp, M.clone());
      const tail = new THREE.BoxGeometry(0.2, 0.22, 0.06);
      tail.translate(side * 0.56, 0.86, -1.91);
      B.add(trimMat, tail, M.clone());
    }
    B.add(slabMat, box(0.4, 0.11, 0.03, 0, 0.6, 1.95), M.clone());
  }
  car(-19.5, 14.0, 0.1, 0);
  car(-19.4, 18.6, -0.06, 2);
  car(20.2, -6.0, Math.PI - 0.08, 4);
  car(20.6, -1.4, Math.PI + 0.05, 1);

  /* --- trees ------------------------------------------------------------ */

  const barkMat = new THREE.MeshStandardMaterial({ map: makeBarkTexture(), color: 0xa08a70, roughness: 0.98 });
  const leafMats = {
    neem: new THREE.MeshStandardMaterial({
      map: makeLeafTexture('neem'), transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, roughness: 0.92, depthWrite: true,
    }),
    gulmohar: new THREE.MeshStandardMaterial({
      map: makeLeafTexture('gulmohar'), transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, roughness: 0.92, depthWrite: true,
    }),
    palm: new THREE.MeshStandardMaterial({
      map: makeLeafTexture('palm'), transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, roughness: 0.9, depthWrite: true,
    }),
  };

  /**
   * Crossed foliage cards on a real trunk. A green ball on a stick is the
   * single most obvious tell of a procedural scene; alpha-cut leaf cards with
   * sky visible through them are not.
   */
  function tree(x, z, kind, scale) {
    const M = new THREE.Matrix4().makeRotationY(r.range(0, 6.28)).setPosition(x, 0, z);
    const h = (kind === 'palm' ? 6.5 : 4.2) * scale;
    const trunkR = (kind === 'palm' ? 0.16 : 0.24) * scale;

    // Trunk with a slight lean and a bend.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(r.range(-0.15, 0.15) * scale, h * 0.4, r.range(-0.15, 0.15) * scale),
      new THREE.Vector3(r.range(-0.35, 0.35) * scale, h * 0.8, r.range(-0.35, 0.35) * scale),
      new THREE.Vector3(r.range(-0.5, 0.5) * scale, h, r.range(-0.5, 0.5) * scale),
    ]);
    // Tapered along its length: a trunk of constant thickness looks like pipe.
    const trunk = new THREE.TubeGeometry(curve, 10, trunkR, 8, false);
    const tp = trunk.attributes.position;
    const axis = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const f = THREE.MathUtils.clamp(y / h, 0, 1);
      curve.getPoint(f, axis);
      const k = 1 - f * 0.62;
      tp.setX(i, axis.x + (tp.getX(i) - axis.x) * k);
      tp.setZ(i, axis.z + (tp.getZ(i) - axis.z) * k);
    }
    trunk.computeVertexNormals();
    B.add(barkMat, trunk, M.clone());
    // Root flare.
    B.add(barkMat, new THREE.CylinderGeometry(trunkR * 1.1, trunkR * 2.2, 0.5 * scale, 9).translate(0, 0.2 * scale, 0), M.clone());

    const top = curve.getPoint(1);
    if (kind === 'palm') {
      for (let i = 0; i < 3; i++) {
        const card = new THREE.PlaneGeometry(5.2 * scale, 5.2 * scale);
        card.rotateY((i / 3) * Math.PI);
        card.translate(top.x, top.y + 0.6 * scale, top.z);
        B.add(leafMats.palm, card, M.clone());
      }
      return;
    }

    // Branches out to where the canopy cards sit.
    const canopyR = (kind === 'gulmohar' ? 3.6 : 3.0) * scale;
    const clumps = 3;
    for (let i = 0; i < clumps; i++) {
      const a = (i / clumps) * Math.PI * 2 + r.range(0, 1);
      const bx = top.x + Math.sin(a) * canopyR * 0.42;
      const bz = top.z + Math.cos(a) * canopyR * 0.42;
      const by = top.y + r.range(0.1, 0.7) * scale;
      const branch = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(top.x * 0.6, top.y - 1.1 * scale, top.z * 0.6),
          new THREE.Vector3((top.x + bx) / 2, (top.y + by) / 2, (top.z + bz) / 2),
          new THREE.Vector3(bx, by, bz),
        ]),
        5, trunkR * 0.42, 5, false
      );
      B.add(barkMat, branch, M.clone());

      // Three cards per clump, crossed at 60°, so the canopy has depth from
      // every angle instead of vanishing edge-on.
      for (let k = 0; k < 3; k++) {
        const size = canopyR * r.range(0.9, 1.25);
        const card = new THREE.PlaneGeometry(size, size);
        card.rotateY((k / 3) * Math.PI + a);
        card.rotateX(r.range(-0.25, 0.25));
        card.translate(bx, by + size * 0.16, bz);
        B.add(leafMats[kind], card, M.clone());
      }
    }
  }

  // Trees along the road and in the corners — never in front of the flag.
  const treeSpots = [];
  for (let i = 0; i < 26; i++) {
    const a = r.range(0, Math.PI * 2);
    const rad = r.range(26, 50);
    const x = Math.sin(a) * rad;
    const z = Math.cos(a) * rad;
    // Keep the sight line from the courtyard to the flag, and off the blocks.
    let clear = true;
    for (const b of built) {
      if (Math.hypot(x - b.x, z - b.z) < b.w * 0.62) clear = false;
    }
    if (Math.abs(x) < 4 && z > 0) clear = false;
    if (!clear) continue;
    treeSpots.push([x, z]);
  }
  // A deliberate pair framing the ceremony from behind.
  treeSpots.push([-20.5, -17.5], [21.5, -16.0], [-24, 20], [25, 22]);
  for (const [x, z] of treeSpots) {
    tree(x, z, r.weighted([['neem', 55], ['gulmohar', 33], ['palm', 12]]), r.range(0.85, 1.35));
  }

  B.build(group);
  scene.add(group);

  return { group, blocks: built };
}
