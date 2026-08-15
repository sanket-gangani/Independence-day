import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeFlagTexture, makeMarigoldSprite, makeRopeTexture } from '../core/textures.js';

/**
 * The flagpole, the halyard and the hoist.
 *
 * The sequence is the whole product, so it is built the way it actually
 * happens rather than as one canned animation:
 *
 *   FURLED   the tricolour is rolled into a bundle, tied with a slip knot at
 *            the halyard, sitting at chest height with marigolds folded inside.
 *   RISING   the bundle climbs as the rope is hauled. It stays tied. The rope
 *            actually shortens on the working side and lengthens on the other.
 *   RELEASE  at the top the knot slips and the tie falls away.
 *   UNFURL   the cloth peels open along its length and catches the wind.
 *   FLOWERS  the marigolds that were inside shower out.
 *
 * THE ROPE IS REAL
 * ----------------
 * A halyard is a closed loop: one run comes down the front of the pole for you
 * to haul on, goes over a pulley at the top, and the other run comes down the
 * back carrying the flag. Both runs are modelled as swept tubes rebuilt every
 * frame from a curve, so the working end can be dragged wherever the player's
 * hands are and the whole thing still reads as one continuous rope.
 *
 * UNFURLING IS A TRAVELLING WAVE, not a scale-up. `uOpen` sweeps a release
 * front from the hoist edge out to the fly end, so the cloth opens
 * progressively the way real fabric does when a knot lets go.
 */

const POLE_H = 11.0;
const FLAG_H = 2.12;
const FLAG_W = FLAG_H * 1.5;

// The two runs of the halyard, either side of the mast. Set wide enough that
// both clear the pole itself — a rope buried in the silhouette of the mast is
// a rope the player never sees, and the whole interaction depends on seeing it.
const HAUL_X = -0.14; // the run you pull
const TAUT_X = 0.14; // the run the flag is clipped to

const TOP_Y = POLE_H - 0.42; // where the flag's top clip ends up
const BASE_Y = 3.25; // where the furled bundle hangs before the hoist

export function createFlag(scene) {
  const group = new THREE.Group();
  group.name = 'flagpole';
  scene.add(group);

  /* --- base -------------------------------------------------------------- */

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb0a58e, roughness: 0.96 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.84, 0.3, 32), stoneMat);
  plinth.position.y = 0.15;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.22, 24), stoneMat);
  step.position.y = 0.4;
  step.receiveShadow = true;
  step.castShadow = true;
  group.add(step);

  // A ring of marigolds round the foot of the pole.
  const marigoldTex = makeMarigoldSprite();
  const marigoldMat = new THREE.MeshStandardMaterial({
    map: marigoldTex,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const ringGeo = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const rr = 0.6 + (i % 3) * 0.03;
    const g = new THREE.PlaneGeometry(0.2, 0.2);
    g.rotateX(-Math.PI / 2 + (i % 2 ? 0.5 : -0.4));
    g.rotateY(a);
    g.translate(Math.cos(a) * rr, 0.55 + (i % 2) * 0.03, Math.sin(a) * rr);
    ringGeo.push(g);
  }
  const marigoldRing = new THREE.Mesh(mergeGeometries(ringGeo), marigoldMat);
  marigoldRing.castShadow = false;
  marigoldRing.receiveShadow = true;
  group.add(marigoldRing);

  /* --- pole -------------------------------------------------------------- */

  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd6d3cb, roughness: 0.38, metalness: 0.62 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.082, POLE_H, 18), poleMat);
  pole.position.y = POLE_H / 2 + 0.5;
  pole.castShadow = true;
  group.add(pole);

  // Joint collars, so it reads as a sectional pole rather than one extrusion.
  for (const y of [4.2, 7.6]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 18), poleMat);
    collar.position.y = y;
    collar.castShadow = true;
    group.add(collar);
  }

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xd0a84e, roughness: 0.3, metalness: 0.85 })
  );
  finial.position.y = POLE_H + 0.66;
  finial.castShadow = true;
  group.add(finial);

  /* --- pulley ------------------------------------------------------------ */
  // The mechanism has to be visible: the whole interaction depends on the
  // player understanding that pulling here makes the flag go up there.

  const pulleyY = POLE_H + 0.4;
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0x8e9298, roughness: 0.42, metalness: 0.7 });
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.07), bracketMat);
  bracket.position.set(0, pulleyY, 0);
  bracket.castShadow = true;
  group.add(bracket);

  // The sheave has to lie in the same plane as the two rope runs, which is the
  // XY plane — a torus is already in XY, so it is deliberately not rotated.
  const sheave = new THREE.Mesh(
    new THREE.TorusGeometry(0.145, 0.03, 8, 22),
    new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.35, metalness: 0.8 })
  );
  sheave.position.set(0, pulleyY, 0);
  sheave.castShadow = true;
  group.add(sheave);
  const sheaveDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.035, 18), bracketMat);
  sheaveDisc.rotation.x = Math.PI / 2;
  sheaveDisc.position.set(0, pulleyY, 0);
  group.add(sheaveDisc);

  // Cleat at working height, where the rope gets tied off.
  const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), bracketMat);
  cleat.position.set(HAUL_X * 1.5, 1.05, 0);
  cleat.castShadow = true;
  group.add(cleat);
  const cleatArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.045), bracketMat);
  cleatArm.position.set(HAUL_X * 1.5, 1.14, 0);
  group.add(cleatArm);

  /* --- rope -------------------------------------------------------------- */

  // White, so it reads against both the paving and the crowd. This rope is
  // the one object the player has to spot on approach.
  const ropeMat = new THREE.MeshStandardMaterial({
    map: makeRopeTexture(),
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
  });

  /**
   * A swept tube that can be rewritten every frame. Cheaper and far more
   * controllable than rebuilding a TubeGeometry, and unlike a THREE.Line it
   * has real thickness, which is the difference between "there is a rope
   * there" and "there is a hairline there".
   */
  class Rope {
    constructor(segments, radius, radial = 6) {
      this.S = segments;
      this.R = radial;
      this.radius = radius;
      const verts = (segments + 1) * (radial + 1);
      this.geo = new THREE.BufferGeometry();
      this.pos = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
      this.nrm = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
      const uv = new Float32Array(verts * 2);
      const idx = [];
      for (let i = 0; i <= segments; i++) {
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          uv[k * 2] = (i / segments) * 14;
          uv[k * 2 + 1] = j / radial;
          if (i < segments && j < radial) {
            const a = k;
            const b = k + radial + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
      this.pos.setUsage(THREE.DynamicDrawUsage);
      this.nrm.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('position', this.pos);
      this.geo.setAttribute('normal', this.nrm);
      this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      this.geo.setIndex(idx);
      this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 24);
      this.mesh = new THREE.Mesh(this.geo, ropeMat);
      this.mesh.castShadow = true;
      this.mesh.frustumCulled = false;

      this._p = new THREE.Vector3();
      this._t = new THREE.Vector3();
      this._n = new THREE.Vector3();
      this._b = new THREE.Vector3();
      this._ref = new THREE.Vector3(0, 0, 1);
    }

    /** @param points control points; a Catmull-Rom is fitted through them. */
    set(points) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
      const { S, R, radius, _p: p, _t: t, _n: n, _b: b, _ref: ref } = this;
      for (let i = 0; i <= S; i++) {
        const u = i / S;
        curve.getPoint(u, p);
        curve.getTangent(u, t).normalize();
        n.crossVectors(t, ref);
        if (n.lengthSq() < 1e-5) n.set(1, 0, 0);
        n.normalize();
        b.crossVectors(t, n).normalize();
        for (let j = 0; j <= R; j++) {
          const a = (j / R) * Math.PI * 2;
          const cx = Math.cos(a);
          const sy = Math.sin(a);
          const k = i * (R + 1) + j;
          const nx = n.x * cx + b.x * sy;
          const ny = n.y * cx + b.y * sy;
          const nz = n.z * cx + b.z * sy;
          this.pos.setXYZ(k, p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
          this.nrm.setXYZ(k, nx, ny, nz);
        }
      }
      this.pos.needsUpdate = true;
      this.nrm.needsUpdate = true;
    }
  }

  const haulRope = new Rope(32, 0.036, 8);
  const tautRope = new Rope(18, 0.034, 8);
  group.add(haulRope.mesh, tautRope.mesh);

  // Wooden toggle on the end of the working rope: the thing your eye lands on
  // and reads as "grab here".
  const toggle = new THREE.Group();
  const toggleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.042, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x9a7748, roughness: 0.8 })
  );
  toggleBody.castShadow = true;
  toggle.add(toggleBody);
  const toggleWrap = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.008, 5, 12), ropeMat);
  toggleWrap.rotation.x = Math.PI / 2;
  toggleWrap.position.y = 0.07;
  toggle.add(toggleWrap);
  group.add(toggle);

  // The coil of spare rope on the plinth.
  const coilPts = [];
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 6;
    const rr = 0.16 + Math.sin(i * 0.4) * 0.02;
    coilPts.push(new THREE.Vector3(HAUL_X * 2.6 + Math.cos(a) * rr, 0.56 + (i / 60) * 0.05, Math.sin(a) * rr));
  }
  const coil = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 64, 0.034, 6, false),
    ropeMat
  );
  coil.castShadow = true;
  group.add(coil);

  /* --- the cloth ---------------------------------------------------------- */

  const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 60, 34);
  // Pivot at the hoist edge, top.
  geo.translate(FLAG_W / 2, -FLAG_H / 2, 0);

  const flagTex = makeFlagTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: flagTex,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
  });

  const uniforms = {
    uTime: { value: 0 },
    uOpen: { value: 0 },
    uWind: { value: 1.0 },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uOpen;
        uniform float uWind;

        // How released this point is. The front sweeps from the hoist edge
        // (uv.x = 0) outward, so the cloth peels open along its length rather
        // than inflating all at once.
        //
        // The constants are not free: at uOpen = 1 the front must clear
        // uv.x = 1 by a full 1/SLOPE, or the fly end of the flag stays rolled
        // and the tricolour never actually finishes opening. At uOpen = 0 it
        // must be at or below -1/SLOPE, or the hoist edge starts already open.
        float releaseAt(vec2 uvw) {
          const float SLOPE = 2.6;
          float front = uOpen * 1.95 - 0.46;
          return clamp((front - uvw.x) * SLOPE, 0.0, 1.0);
        }

        void clothWave(vec2 uvw, float rel, out float disp, out float ddu, out float ddv) {
          float ramp = pow(uvw.x, 1.22);
          float dramp = 1.22 * pow(max(uvw.x, 0.0001), 0.22);
          float t = uTime * uWind;

          float a1 = uvw.x * 6.4 - t * 2.9;
          float a2 = uvw.x * 3.6 + uvw.y * 4.6 - t * 2.0;
          float a3 = uvw.y * 2.8 - t * 1.25;

          float s1 = sin(a1) * 0.215;
          float s2 = sin(a2) * 0.12;
          float s3 = sin(a3) * 0.06;

          float base = s1 + s2 + s3;
          disp = base * ramp * rel;

          float du = (cos(a1) * 0.215 * 6.4) + (cos(a2) * 0.12 * 3.6);
          float dv = (cos(a2) * 0.12 * 4.6) + (cos(a3) * 0.06 * 2.8);
          ddu = (du * ramp + base * dramp) * rel;
          ddv = dv * ramp * rel;
        }

        // Furled: the sheet is wound into a tube along the hoist edge and
        // squeezed vertically, so it becomes the bundle rather than vanishing.
        vec3 rollUp(vec3 p, vec2 uvw, float rel) {
          float roll = 1.0 - rel;
          float radius = 0.085;
          float angle = (p.x / max(radius, 0.001)) * roll;
          float rx = mix(p.x, sin(angle) * radius, roll);
          float rz = mix(p.z, (1.0 - cos(angle)) * radius, roll);
          float ry = mix(p.y, p.y * 0.94 - ${(FLAG_H * 0.0).toFixed(3)}, roll);
          return vec3(rx, ry, rz);
        }
      `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        {
          float rel = releaseAt(uv);
          float d, ddu, ddv;
          clothWave(uv, rel, d, ddu, ddv);
          objectNormal = normalize(vec3(-ddu / ${FLAG_W.toFixed(2)}, -ddv / ${FLAG_H.toFixed(2)}, 1.0));
        }
      `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          float rel = releaseAt(uv);
          float d, ddu, ddv;
          clothWave(uv, rel, d, ddu, ddv);

          transformed = rollUp(transformed, uv, rel);
          transformed.z += d;
          // Released cloth sags under its own weight and is tugged back in.
          transformed.y -= pow(uv.x, 1.55) * 0.13 * rel;
          transformed.x -= pow(uv.x, 2.0) * 0.075 * rel;
          // The brief drop as the knot lets go, before the wind takes it.
          transformed.y -= (1.0 - rel) * 0.03;
        }
      `
      );
  };
  mat.customProgramCacheKey = () => 'tricolour-cloth-v2';

  const cloth = new THREE.Mesh(geo, mat);
  cloth.castShadow = true;
  cloth.frustumCulled = false;

  const carrier = new THREE.Group(); // rides up and down the taut rope
  carrier.position.set(TAUT_X, BASE_Y, 0);
  cloth.position.set(0.03, 0, 0);
  carrier.add(cloth);
  group.add(carrier);

  /* --- the furled bundle -------------------------------------------------- */
  //
  // Before the rope is pulled the flag is not a small flat rectangle at the
  // top of the pole — it is a rolled bundle of cloth tied with a slip knot,
  // exactly as it is at every hoisting, with the marigolds inside it.

  const bundle = new THREE.Group();
  carrier.add(bundle);

  const rollMat = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.95 });
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, FLAG_H * 0.94, 18, 5), rollMat);
  // Bulge it slightly in the middle and crease it, so it is cloth not a dowel.
  {
    const p = roll.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / (FLAG_H * 0.94);
      const bulge = 1 + Math.cos(y * Math.PI) * 0.16 + Math.sin(y * 22) * 0.03;
      p.setXYZ(i, p.getX(i) * bulge, p.getY(i), p.getZ(i) * bulge);
    }
    roll.geometry.computeVertexNormals();
  }
  roll.position.y = -FLAG_H * 0.47;
  roll.castShadow = true;
  bundle.add(roll);

  // A loose fold of cloth escaping at the bottom, and the ties.
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.38, 12, 1, true),
    new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.95 })
  );
  tail.position.y = -FLAG_H * 0.94 - 0.1;
  tail.rotation.z = 0.25;
  bundle.add(tail);

  const tieMat = new THREE.MeshStandardMaterial({ color: 0xd9c48f, roughness: 0.95 });
  const ties = [];
  for (const ty of [-0.32, -1.0, -1.7]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.021, 6, 16), tieMat);
    t.rotation.x = Math.PI / 2;
    t.position.y = ty;
    t.scale.set(1, 1, 1.05);
    bundle.add(t);
    ties.push(t);
  }
  // The slip knot's free end, the bit that gets tugged loose.
  const knotTail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.3, 5), tieMat);
  knotTail.position.set(0.1, -0.44, 0.06);
  knotTail.rotation.z = 0.5;
  bundle.add(knotTail);

  // Marigolds tucked into the top of the bundle — the ones that shower out.
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf5a52a, roughness: 0.88 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), petalMat);
    bud.position.set(Math.cos(a) * 0.075, -0.04 - (i % 3) * 0.02, Math.sin(a) * 0.075);
    bundle.add(bud);
  }

  // Clips holding the bundle to the halyard.
  const clipMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.7 });
  for (const cy of [0, -FLAG_H * 0.94]) {
    const clip = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 5, 10), clipMat);
    clip.rotation.y = Math.PI / 2;
    clip.position.set(-0.02, cy, 0);
    carrier.add(clip);
  }

  /* --- state -------------------------------------------------------------- */

  let hoist = 0;
  let open = 0;
  let grip = null; // world-space point the working rope is being pulled to
  const _tmp = new THREE.Vector3();

  // Where the working end dangles when nobody is holding it. Deliberately
  // swung out from the pole and toward the way you walk in, so the first thing
  // you see on approach is a rope hanging at hand height with a toggle on it.
  const HANG = new THREE.Vector3(HAUL_X - 0.44, 1.46, 0.36);

  function apply() {
    const y = BASE_Y + (TOP_Y - BASE_Y) * hoist;
    carrier.position.y = y;

    uniforms.uOpen.value = open;
    // Hard swap at the moment the knot goes: bundle out, cloth in.
    const bundleVisible = open < 0.06;
    bundle.visible = bundleVisible;
    cloth.visible = !bundleVisible || open > 0.001;
    for (const t of ties) t.visible = open < 0.02;
    knotTail.visible = open < 0.02;

    // --- the working rope ---
    const target = grip ? _tmp.copy(grip) : _tmp.copy(HANG);
    // Hauling shortens the working side: the free end climbs as the flag does.
    const slack = 1 - hoist;
    const pts = [
      new THREE.Vector3(HAUL_X, pulleyY - 0.02, 0),
      new THREE.Vector3(HAUL_X, pulleyY * 0.62, 0),
      new THREE.Vector3(HAUL_X, Math.max(target.y + 0.95, 1.9), 0.004),
      new THREE.Vector3(
        HAUL_X + (target.x - HAUL_X) * 0.55,
        target.y + 0.32,
        (target.z) * 0.55
      ),
      target.clone(),
      new THREE.Vector3(
        HAUL_X * 1.4 + (target.x - HAUL_X) * 0.3,
        Math.max(target.y - 0.55 - slack * 0.15, 0.72),
        target.z * 0.3
      ),
      new THREE.Vector3(HAUL_X * 1.5, 1.1, 0.02),
      new THREE.Vector3(HAUL_X * 2.4, 0.62, 0.05),
    ];
    haulRope.set(pts);
    toggle.position.copy(pts[5]);
    toggle.rotation.z = 0.4;

    // --- the flag's run ---
    tautRope.set([
      new THREE.Vector3(TAUT_X, pulleyY - 0.02, 0),
      new THREE.Vector3(TAUT_X, (pulleyY + y) / 2, 0),
      new THREE.Vector3(TAUT_X, y, 0),
      new THREE.Vector3(TAUT_X, (y - FLAG_H * 0.94 + 0.62) / 2 + 0.4, 0),
      new THREE.Vector3(TAUT_X, 0.62, 0),
    ]);
  }

  apply();

  return {
    group,
    cloth,
    carrier,
    poleHeight: POLE_H,
    topY: TOP_Y,
    baseY: BASE_Y,
    flagWidth: FLAG_W,
    flagHeight: FLAG_H,
    /** Where a player has to stand to reach the rope, and which way to face. */
    ropeSpot: new THREE.Vector3(HAUL_X - 0.78, 0, 0.46),

    get hoist() {
      return hoist;
    },
    get open() {
      return open;
    },
    /** World height of the top of the bundle — the petals burst from here. */
    get bundleY() {
      return BASE_Y + (TOP_Y - BASE_Y) * hoist;
    },
    /** Where the hands should close on the rope when they reach for it. */
    restingGrip() {
      return HANG.clone().add(group.position);
    },

    setHoist(h) {
      hoist = THREE.MathUtils.clamp(h, 0, 1);
      apply();
    },
    setOpen(o) {
      open = THREE.MathUtils.clamp(o, 0, 1);
      apply();
    },
    /** Hands take the rope: pass a world point, or null to let it hang. */
    setGrip(point) {
      grip = point ? (grip ?? new THREE.Vector3()).copy(point).sub(group.position) : null;
      apply();
    },

    update(dt, wind = 1) {
      uniforms.uTime.value += dt;
      uniforms.uWind.value = wind;
    },
  };
}
