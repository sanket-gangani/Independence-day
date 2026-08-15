import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/rng.js';
import {
  makePaverTexture,
  makeRoadTexture,
  makeGrassTexture,
  makeSoilTexture,
  makeRangoliTexture,
  makeConcreteTexture,
} from '../core/textures.js';

/**
 * The ground the ceremony stands on.
 *
 * Not a disc of stone in a field. This is the open courtyard of a housing
 * society: interlocking paver blocks in the middle where the residents park
 * and play and hold functions, the internal road looping round it, kerbed
 * garden beds, patchy lawn, drain covers, a manhole, and a hand-drawn rangoli
 * around the flagpole that somebody was still finishing at half past six.
 *
 * It also owns the answer to "how high is the ground here", which every other
 * system asks before it puts anything down. `colliders` is the list of meshes
 * worth raycasting; `heightAt` is the cheap analytic fallback.
 */

const COURT = 17.5; // half-width of the paved courtyard
const ROAD_IN = 19.0;
const ROAD_OUT = 24.5;

export function createPlaza(scene) {
  const group = new THREE.Group();
  group.name = 'plaza';
  const r = rng(2026);

  const paver = makePaverTexture();
  paver.repeat.set(9, 9);
  const road = makeRoadTexture();
  road.repeat.set(10, 10);
  const grass = makeGrassTexture();
  grass.repeat.set(26, 26);
  const soil = makeSoilTexture();
  soil.repeat.set(6, 6);
  const concrete = makeConcreteTexture();

  /* --- the wider ground ------------------------------------------------- */

  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1, metalness: 0 })
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.08;
  field.receiveShadow = true;
  group.add(field);

  /* --- the internal road ------------------------------------------------ */

  const roadMesh = new THREE.Mesh(
    new THREE.RingGeometry(ROAD_IN, ROAD_OUT, 72, 1),
    new THREE.MeshStandardMaterial({ map: road, roughness: 0.96, metalness: 0 })
  );
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.y = -0.045;
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // A spur running out to the gate.
  const spur = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 34),
    new THREE.MeshStandardMaterial({ map: road.clone(), roughness: 0.96 })
  );
  spur.material.map.repeat.set(1.6, 9);
  spur.rotation.x = -Math.PI / 2;
  spur.rotation.z = 0;
  spur.position.set(0, -0.043, 39);
  spur.receiveShadow = true;
  group.add(spur);

  /* --- the paved courtyard ---------------------------------------------- */

  // Not a circle: society courtyards are the shape of whatever the buildings
  // left over. A rounded rectangle reads as built, a circle reads as a level.
  function roundedRect(w, h, rad) {
    const s = new THREE.Shape();
    s.moveTo(-w + rad, -h);
    s.lineTo(w - rad, -h);
    s.quadraticCurveTo(w, -h, w, -h + rad);
    s.lineTo(w, h - rad);
    s.quadraticCurveTo(w, h, w - rad, h);
    s.lineTo(-w + rad, h);
    s.quadraticCurveTo(-w, h, -w, h - rad);
    s.lineTo(-w, -h + rad);
    s.quadraticCurveTo(-w, -h, -w + rad, -h);
    return s;
  }

  const w = COURT;
  const h = COURT * 0.94;
  const shape = roundedRect(w, h, 3.4);

  const courtGeo = new THREE.ShapeGeometry(shape, 12);
  courtGeo.rotateX(-Math.PI / 2);
  // Planar UVs so the paving stays the same size everywhere.
  const p = courtGeo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / 4;
    uv[i * 2 + 1] = p.getZ(i) / 4;
  }
  courtGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const courtTex = paver.clone();
  courtTex.repeat.set(1, 1);
  courtTex.needsUpdate = true;
  const court = new THREE.Mesh(
    courtGeo,
    new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.95, metalness: 0 })
  );
  court.position.y = 0;
  court.receiveShadow = true;
  group.add(court);

  // Kerb: a band around the paving, not a slab under it. Built as an outer
  // outline with the courtyard punched out of it as a hole — extruding the
  // courtyard shape itself would tile a concrete lid over the entire yard.
  const kerbMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xc4bcaa, roughness: 0.94 });
  const kerbShape = roundedRect(w + 0.34, h + 0.34, 3.5);
  kerbShape.holes.push(roundedRect(w, h, 3.4));
  const kerb = new THREE.Mesh(
    new THREE.ExtrudeGeometry(kerbShape, { depth: 0.2, bevelEnabled: false, steps: 1, curveSegments: 8 }),
    kerbMat
  );
  kerb.rotation.x = -Math.PI / 2;
  kerb.position.y = 0.0;
  kerb.castShadow = true;
  kerb.receiveShadow = true;
  group.add(kerb);
  // The paving sits just below the kerb's top, so the kerb reads as an edge.
  court.position.y = 0.145;

  /* --- rangoli ---------------------------------------------------------- */

  const rangoli = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 64),
    new THREE.MeshStandardMaterial({
      map: makeRangoliTexture(),
      transparent: true,
      roughness: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  rangoli.rotation.x = -Math.PI / 2;
  rangoli.position.y = 0.147;
  rangoli.receiveShadow = true;
  group.add(rangoli);

  /* --- garden beds ------------------------------------------------------ */

  const bedMat = new THREE.MeshStandardMaterial({ map: soil, roughness: 1 });
  const hedgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const shrubs = [];
  const tintColor = new THREE.Color();

  /** Bakes a colour so every shrub can share one material and one draw call. */
  function tint(geo, color) {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  const beds = [
    { x: 0, z: 21.8, w: 9, d: 3.2, a: 0 },
    { x: -21.5, z: -3, w: 3.2, d: 11, a: 0 },
    { x: 21.5, z: 4, w: 3.2, d: 12, a: 0 },
    { x: -13, z: -22.5, w: 10, d: 3.0, a: 0.2 },
    { x: 14, z: -22.5, w: 9, d: 3.0, a: -0.15 },
  ];
  for (const b of beds) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.26, b.d), bedMat);
    bed.position.set(b.x, 0.05, b.z);
    bed.rotation.y = b.a;
    bed.receiveShadow = true;
    group.add(bed);

    // Kerb of painted bricks round the bed.
    const ring = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.3, b.d + 0.5), kerbMat);
    ring.position.set(b.x, 0.06, b.z);
    ring.rotation.y = b.a;
    ring.receiveShadow = true;
    group.add(ring);
    bed.position.y = 0.14;

    // Shrubs, croton and a few flowers. Emitted into a shared list and merged
    // once at the end — fifty individual bushes is fifty draw calls for
    // scenery nobody looks directly at.
    const n = Math.floor((b.w * b.d) / 3.6);
    for (let i = 0; i < n; i++) {
      const bx = b.x + (r() - 0.5) * (b.w - 0.7);
      const bz = b.z + (r() - 0.5) * (b.d - 0.7);
      const s = r.range(0.34, 0.8);
      const bush = new THREE.SphereGeometry(s, 8, 6);
      bush.scale(1, r.range(0.7, 1.05), 1);
      bush.translate(bx, 0.22 + s * 0.62, bz);
      tintColor.setHSL(0.26 + r.range(-0.05, 0.06), r.range(0.28, 0.5), r.range(0.2, 0.33));
      shrubs.push(tint(bush, tintColor));
      if (r.chance(0.3)) {
        const bloom = new THREE.SphereGeometry(s * 0.42, 7, 5);
        bloom.translate(bx, 0.3 + s, bz);
        tintColor.set(r.pick([0xd8613a, 0xe0a02c, 0xc44a6a, 0xe8d24a]));
        shrubs.push(tint(bloom, tintColor));
      }
    }
  }

  if (shrubs.length) {
    const foliage = new THREE.Mesh(mergeGeometries(shrubs), hedgeMat);
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    group.add(foliage);
  }

  /* --- the small things ------------------------------------------------- */

  // Drain covers and a manhole: nobody notices them, everybody would notice
  // their absence.
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x50504c, roughness: 0.7, metalness: 0.35 });
  for (const [x, z] of [[-9.4, 12.6], [11.2, -9.4], [-14.6, -7.2], [6.4, 15.2]]) {
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 12), metalMat);
    cover.position.set(x, 0.155, z);
    cover.rotation.y = r.range(0, 3);
    cover.receiveShadow = true;
    group.add(cover);
  }
  // A strip drain along one edge of the paving.
  const drain = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 13), metalMat);
  drain.position.set(-COURT + 0.5, 0.16, 1);
  group.add(drain);

  // Faded parking bay lines on one side of the courtyard.
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.98, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 7; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4.6), paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(-16.4 + i * 2.5, 0.148, -12.6 + r.range(-0.1, 0.1));
    group.add(line);
  }

  scene.add(group);

  /**
   * Ground height. The courtyard is a raised paved slab inside a lower road
   * and lawn, so this is genuinely a function of position rather than the
   * zero everything used to assume.
   */
  function heightAt(x, z) {
    const inCourt = Math.abs(x) <= COURT && Math.abs(z) <= COURT * 0.94;
    if (inCourt) return 0.145;
    const rad = Math.hypot(x, z);
    if (rad >= ROAD_IN && rad <= ROAD_OUT) return -0.045;
    return -0.08;
  }

  return {
    group,
    court,
    heightAt,
    /** Meshes worth raycasting against when placing something precisely. */
    colliders: [court, field, roadMesh],
    bounds: { court: COURT },
    sync(skyState) {
      // The paving picks up the colour of the light, subtly. The lawn does not
      // — washing the grass out toward the sky tint is what turned it into a
      // pale nothing rather than a patchy society lawn.
      court.material.color.copy(skyState.groundTint);
    },
  };
}
