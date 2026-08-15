import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight, POLE_POS } from './terrain.js';

/**
 * Snow-dusted pines. One merged geometry with baked vertex colours (deep
 * needle green underneath, snow load on the upper rim of each tier), drawn as
 * a single InstancedMesh. Scattered along the corridor only — the rest of the
 * valley stays open so the flagpole keeps the eye.
 */

const COUNT = 46;

function buildTreeGeometry() {
  const parts = [];

  const trunk = new THREE.CylinderGeometry(0.085, 0.14, 0.9, 6);
  trunk.translate(0, 0.45, 0);
  paint(trunk, () => new THREE.Color(0x5c4b36));
  parts.push(trunk);

  // Foliage starts low — a bare stem reads as a black post at this light level.
  const tiers = [
    { y: 0.26, r: 1.2, h: 1.6 },
    { y: 1.24, r: 0.95, h: 1.45 },
    { y: 2.12, r: 0.68, h: 1.25 },
    { y: 2.92, r: 0.38, h: 1.0 },
  ];

  const needle = new THREE.Color(0x33513c);
  const snow = new THREE.Color(0xeff5ff);

  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 9, 3);
    cone.translate(0, t.y + t.h / 2, 0);
    // Snow settles on the wide bottom rim of each tier and on the tip.
    paint(cone, (x, y, z) => {
      const local = (y - t.y) / t.h; // 0 at rim, 1 at tip
      const load = Math.max(
        // rim collar
        1 - Math.min(1, local / 0.22),
        // dusting on the tip
        Math.max(0, (local - 0.72) / 0.28) * 0.8
      );
      // Break it up so the snow line is not a perfect band.
      const jitter = 0.5 + 0.5 * Math.sin(x * 9.3 + z * 7.1);
      return needle.clone().lerp(snow, Math.min(1, load * (0.55 + jitter * 0.65)));
    });
    parts.push(cone);
  }

  const geo = BufferGeometryUtils.mergeGeometries(parts, false);
  geo.computeVertexNormals();
  return geo;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTrees(scene) {
  const geo = buildTreeGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'trees';

  const rand = mulberry32(4242);
  const dummy = new THREE.Object3D();

  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < 4000) {
    // Flank the corridor: close enough to frame the walk, never on the path.
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (7 + rand() * 22);
    const z = -34 + rand() * 86;

    // Keep the ground around the flagpole clear.
    if (Math.hypot(x - POLE_POS.x, z - POLE_POS.z) < 16) continue;

    dummy.position.set(x, terrainHeight(x, z) - 0.15, z);
    dummy.rotation.set(
      (rand() - 0.5) * 0.06,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.06
    );
    const s = 0.85 + rand() * 1.25;
    dummy.scale.set(s * (0.9 + rand() * 0.2), s, s * (0.9 + rand() * 0.2));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  scene.add(mesh);
  return { mesh };
}
