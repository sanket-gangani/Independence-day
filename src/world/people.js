import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeHeadGeometry, faceMaterial, SKIN_TONES } from '../core/faces.js';

/**
 * The people.
 *
 * Everyone in this scene — the player and every single person in the crowd —
 * is built here, from scratch, at load time. There are no downloaded character
 * models: the ones that were here before were a sci-fi robot and two western
 * mocap dummies, which is exactly the wrong thing for a courtyard on 15 August.
 *
 * Building them procedurally buys three things that matter more than a
 * higher-fidelity import would:
 *
 *   1. INDIAN CLOTHING. Kurta-pyjama, saree with a draped pallu, salwar-kameez
 *      with a dupatta, dhoti, school uniforms, shirt-and-trousers. None of that
 *      exists in a stock rig, and retexturing cannot produce a saree's
 *      silhouette.
 *
 *   2. NOBODY FLOATS, EVER. Each body is assembled feet-first and then the
 *      finished group's bounding box is measured and the root shifted so the
 *      lowest vertex sits at exactly y = 0. The player additionally runs a
 *      per-frame foot solve. Floating is structurally impossible rather than
 *      something to eyeball.
 *
 *   3. REAL VARIETY. Height, build, skin, hair, age, clothing, stance and
 *      what a person is doing with their hands are all independent axes, so a
 *      hundred people can be a hundred people rather than one person repeated.
 *
 * COST
 * ----
 * Everything that shares a node is merged into one draw call using vertex
 * colours against a single shared cloth material, so a crowd member costs four
 * to six draws: body (torso + legs + garment), head, hair, two arms, and a
 * prop if they are holding one. Arms carry a permanent slight elbow bend baked
 * into the geometry, which means an arm is one rigid mesh and clapping,
 * waving and saluting are all shoulder rotations.
 */

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* palette                                                             */
/* ------------------------------------------------------------------ */

// Deliberately not a tricolour parade. Real Indian morning crowds are creams,
// whites, pastels, checks and the odd bright saree. If everyone wears orange,
// white and green the flag stops being the thing you look at.
const KURTA_COLORS = [
  0xf0e9d8, 0xe2dac4, 0xcdd8dc, 0xdccfb4, 0xc3ccd8, 0xe6d8c0, 0xb8c4b4, 0xd6c6d2,
  0x8fa5b0, 0xb08a62, 0x9aab8c, 0xc0a07a,
];
const SHIRT_COLORS = [
  0xcdd9e4, 0xdfd8c8, 0xb3c4cd, 0xe6e4dc, 0x9fb0bc, 0xc7bcab, 0x8fa4b2, 0xd4c6ac,
  0x7f95a6, 0xa8886c, 0xb4b8ac,
];
const TROUSER_COLORS = [0x3b4148, 0x4a4038, 0x2f3740, 0x554b3e, 0x3a3f36, 0x2b2f36, 0x5c5648, 0x6b6255];
const JEANS_COLORS = [0x46566b, 0x3b4a5c, 0x5a6b7d];
const SAREE_COLORS = [
  0xc2413c, 0xd4762a, 0x1f6f5c, 0x8e3b6b, 0x2e5b8e, 0xd9a441, 0x9d2f4a, 0x3f7d4e, 0xe0e3e8, 0xb8574f,
  0x6b4a8e, 0xcf8b3a,
];
const SALWAR_COLORS = [0x7fa3c4, 0xd3a04f, 0xa8557a, 0x5e9578, 0xd7dbe0, 0xc9705a, 0x8b7fc0, 0xd9c46a];
const PYJAMA_COLORS = [0xf1ece0, 0xe6e0d2, 0xdcd6c8, 0xeee9dd];
const HAIR_COUNT = 5;

/* ------------------------------------------------------------------ */
/* shared materials                                                    */
/* ------------------------------------------------------------------ */

let clothMat = null;
export function clothMaterial() {
  if (!clothMat) {
    clothMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
    });
  }
  return clothMat;
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const _col = new THREE.Color();

/** Bakes a colour into a geometry so everything can share one material. */
function paint(geo, color) {
  _col.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _col.r;
    arr[i * 3 + 1] = _col.g;
    arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

/** A tapered limb segment hanging down from the origin, with ball joints. */
function limb(rTop, rBot, len, seg = 8, ends = 3) {
  const out = [];
  const cyl = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, true);
  cyl.translate(0, -len / 2, 0);
  out.push(cyl);
  if (ends & 1) out.push(new THREE.SphereGeometry(rTop, seg, 5));
  if (ends & 2) {
    const s = new THREE.SphereGeometry(rBot, seg, 5);
    s.translate(0, -len, 0);
    out.push(s);
  }
  return out;
}

/** Body of revolution from a [radius, y] profile, capped, optionally flattened. */
function lathe(profile, seg = 16, depth = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0006), y));
  const parts = [new THREE.LatheGeometry(pts, seg)];

  const cap = (r, y, up) => {
    const c = new THREE.CircleGeometry(r, seg);
    c.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    c.translate(0, y, 0);
    return c;
  };
  parts.push(cap(pts[0].x, pts[0].y, false));
  parts.push(cap(pts[pts.length - 1].x, pts[pts.length - 1].y, true));

  const geo = mergeGeometries(parts);
  if (depth !== 1) geo.scale(1, 1, depth);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A flat strip of cloth following a curve — a saree's pallu, a dupatta, the
 * bunting, the sash on the furled flag. Cheap, and it drapes.
 */
export function ribbon(curve, width, segments = 26, taper = 0.45, sag = 0.02) {
  const pos = [];
  const uvs = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();

    const w = width * (1 - taper * t * t) * 0.5;
    // A little wave across the cloth so it is not a flat plank.
    const wob = Math.sin(t * 7.0) * sag;
    pos.push(p.x - side.x * w, p.y - side.y * w + wob, p.z - side.z * w);
    pos.push(p.x + side.x * w, p.y + side.y * w - wob, p.z + side.z * w);
    uvs.push(0, t, 1, t);

    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Merges a list of already-painted geometries into one mesh. */
function meshOf(list, material, name) {
  if (!list.length) return null;
  const geo = list.length === 1 ? list[0] : mergeGeometries(list);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
/* person spec                                                         */
/* ------------------------------------------------------------------ */

const AGE_HEIGHT = {
  toddler: [0.86, 1.0],
  child: [1.06, 1.28],
  teen: [1.44, 1.62],
  adult: [1.56, 1.79],
  elder: [1.5, 1.68],
};

/**
 * Rolls a believable person. Ages, clothing and props are weighted the way an
 * actual society courtyard looks at eight in the morning: mostly adults, a
 * decent scatter of children, a few elders, one or two people filming.
 */
export function rollPerson(r, opts = {}) {
  const age =
    opts.age ??
    r.weighted([
      ['adult', 46],
      ['child', 20],
      ['teen', 12],
      ['elder', 11],
      ['toddler', 4],
    ]);
  const female = opts.female ?? r.chance(age === 'elder' ? 0.42 : 0.48);
  const [hlo, hhi] = AGE_HEIGHT[age];
  let height = r.range(hlo, hhi);
  if (female && age === 'adult') height -= 0.09;
  if (female && age === 'teen') height -= 0.05;

  const build = r.range(0, 1) * (age === 'adult' || age === 'elder' ? 1 : 0.5);

  // Hair.
  let hairStyle;
  if (female) hairStyle = r.weighted([['plait', 34], ['bun', 30], ['open', 36]]);
  else if (age === 'elder') hairStyle = r.weighted([['crop', 45], ['bald', 35], ['short', 20]]);
  else hairStyle = r.weighted([['short', 46], ['crop', 30], ['parted', 24]]);

  const grey = age === 'elder' ? r.chance(0.8) : age === 'adult' ? r.chance(0.12) : false;

  let beard = 0;
  if (!female && (age === 'adult' || age === 'elder')) {
    beard = r.weighted([[0, 34], [1, 22], [2, 30], [3, 14]]);
  }

  // Clothing.
  let outfit;
  if (age === 'toddler') outfit = female ? 'frock' : 'tee';
  else if (age === 'child') outfit = r.weighted([['uniform', 40], ['tee', 26], female ? ['frock', 34] : ['kurta', 34]]);
  else if (female) outfit = r.weighted([['saree', age === 'elder' ? 62 : 40], ['salwar', 46], ['tee', age === 'teen' ? 22 : 6]]);
  else outfit = r.weighted([['kurta', 40], ['shirt', 34], ['tee', age === 'teen' ? 26 : 12], ['dhoti', age === 'elder' ? 26 : 4]]);

  const prop = r.weighted([
    ['none', 54],
    ['flag', age === 'child' || age === 'toddler' ? 26 : 11],
    ['phone', age === 'teen' || age === 'adult' ? 16 : 2],
  ]);

  const activity = opts.activity ?? r.weighted([['watch', 48], ['talk', 16], ['clasp', 22], ['hips', 14]]);

  return {
    age,
    female,
    height,
    build,
    skin: r.int(0, SKIN_TONES.length - 1),
    hair: grey ? -1 : r.int(0, HAIR_COUNT - 1),
    hairStyle,
    beard,
    bindi: female && age !== 'toddler' && r.chance(0.72),
    glasses: r.chance(age === 'elder' ? 0.6 : age === 'adult' ? 0.18 : 0.06),
    topi: !female && (age === 'elder' || age === 'adult') && r.chance(0.1),
    outfit,
    prop,
    activity,
    colors: {
      kurta: r.pick(KURTA_COLORS),
      shirt: r.pick(SHIRT_COLORS),
      trouser: r.pick(TROUSER_COLORS),
      jeans: r.pick(JEANS_COLORS),
      saree: r.pick(SAREE_COLORS),
      blouse: r.pick(SAREE_COLORS),
      salwar: r.pick(SALWAR_COLORS),
      pyjama: r.pick(PYJAMA_COLORS),
      tee: r.pick([0xc9d4dc, 0xd8c6ab, 0xafc0a6, 0xc4aebc, 0xe4dfd2, 0x9db0bf, 0xb4544a, 0x3f6b8c, 0xd8a63c]),
    },
    // A tricolour ribbon, wristband or scarf — the one place the flag colours
    // are allowed onto a person.
    tricolour: r.chance(0.22),
    tilt: r.range(-1, 1),
  };
}

/* ------------------------------------------------------------------ */
/* the build                                                           */
/* ------------------------------------------------------------------ */

/**
 * Assembles a person.
 *
 * @param spec        from rollPerson
 * @param opts.legs   true to give the legs joints (the player walks; the crowd
 *                    stands, and rigid legs there save four draw calls each)
 * @param opts.detail 0 crowd, 1 hero
 */
export function buildPerson(spec, opts = {}) {
  const legsArticulated = !!opts.legs;
  const detail = opts.detail ?? 0;
  const mat = clothMaterial();
  const H = spec.height;
  const F = spec.female;
  const kid = spec.age === 'child' || spec.age === 'toddler';

  // Children are not scaled-down adults: bigger head, shorter limbs.
  const headR = H * (spec.age === 'toddler' ? 0.083 : spec.age === 'child' ? 0.074 : 0.0655);
  const fat = 1 + spec.build * (spec.age === 'elder' ? 0.22 : 0.18);

  const HIP_Y = H * (kid ? 0.49 : 0.505);
  const NECK_LOCAL = H * (kid ? 0.31 : 0.34) - (kid ? 0 : 0);
  const SHOULDER_LOCAL = NECK_LOCAL - H * 0.048;
  const shoulderX = H * (F ? 0.094 : 0.106) * (1 + spec.build * 0.1);
  const hipX = H * 0.048;
  const thighLen = HIP_Y - H * 0.27;
  const shinLen = H * 0.27 - H * 0.035;

  const c = spec.colors;
  const skin = SKIN_TONES[spec.skin % SKIN_TONES.length];

  // Which garment covers what.
  const O = spec.outfit;
  const topColor =
    O === 'kurta' || O === 'dhoti' ? c.kurta
      : O === 'shirt' ? c.shirt
        : O === 'saree' ? c.blouse
          : O === 'salwar' ? c.salwar
            : O === 'frock' ? c.salwar
              : O === 'uniform' ? 0xf2f0e8
                : c.tee;
  const legColor =
    O === 'kurta' ? c.pyjama
      : O === 'dhoti' ? 0xf4efe2
        : O === 'shirt' ? c.trouser
          : O === 'saree' ? c.saree
            : O === 'salwar' ? c.salwar
              : O === 'uniform' ? 0x2f3a52
                : O === 'frock' ? c.salwar
                  : c.jeans;

  const longTop = O === 'kurta' || O === 'salwar' || O === 'dhoti' || O === 'frock';
  const sleeveLong = O === 'kurta' || O === 'dhoti' || (O === 'shirt' && !kid) || O === 'salwar';
  const bareArms = O === 'saree' || O === 'tee' || O === 'uniform' || O === 'frock';

  /* --- nodes ----------------------------------------------------------- */

  const root = new THREE.Group();
  root.name = 'person';

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);

  const neck = new THREE.Group();
  neck.position.y = NECK_LOCAL;
  torso.add(neck);

  const armL = new THREE.Group();
  armL.position.set(shoulderX, SHOULDER_LOCAL, 0);
  torso.add(armL);
  const armR = new THREE.Group();
  armR.position.set(-shoulderX, SHOULDER_LOCAL, 0);
  torso.add(armR);

  /* --- torso ----------------------------------------------------------- */

  const body = []; // merged into the hips mesh
  const torsoParts = [];

  const chestR = H * (F ? 0.099 : 0.106) * fat;
  const waistR = H * (F ? 0.082 : 0.092) * fat;
  const hipR = H * (F ? 0.101 : 0.094) * fat;
  const depth = F ? 0.7 : 0.66;

  // Top garment / torso shell. Profile runs from the hem up to the collar.
  const hemY = longTop ? -H * (O === 'frock' ? 0.2 : 0.115) : O === 'saree' ? H * 0.055 : -H * 0.015;
  const hemR = longTop ? hipR * (O === 'frock' ? 1.55 : 1.22) : hipR * 1.02;

  const topProfile =
    O === 'saree'
      ? [
        // A blouse: cropped, ends above the midriff.
        [chestR * 0.99, H * 0.13],
        [chestR * 1.03, H * 0.2],
        [chestR * 1.0, H * 0.255],
        [chestR * 0.93, H * 0.288],
        [chestR * 0.72, H * 0.312],
        [H * 0.054, H * 0.332],
        [H * 0.046, H * 0.34],
      ]
      : [
        [hemR, hemY],
        [hipR * 1.06, hemY + H * 0.06],
        [waistR, H * 0.115],
        [chestR, H * 0.2],
        [chestR * 1.02, H * 0.252],
        // Trapezius: without these two the profile jumps straight from chest
        // width to neck width and every shoulder becomes a flat shelf.
        [chestR * 0.95, H * 0.288],
        [chestR * 0.74, H * 0.312],
        [H * 0.058, H * 0.334],
        [H * 0.05, H * 0.342],
      ];
  torsoParts.push(paint(lathe(topProfile, detail ? 22 : 14, depth), topColor));

  if (O === 'saree') {
    // Midriff and the waistline of the sari, in skin then cloth.
    torsoParts.push(
      paint(
        lathe(
          [
            [waistR * 1.0, H * 0.02],
            [waistR * 0.97, H * 0.075],
            [chestR * 0.94, H * 0.132],
          ],
          detail ? 20 : 14,
          depth
        ),
        skin
      )
    );
  }

  // Neck.
  torsoParts.push(
    paint(
      lathe(
        [
          [H * 0.042, H * 0.3],
          [H * 0.036, H * 0.345],
          [H * 0.034, NECK_LOCAL + H * 0.004],
        ],
        detail ? 14 : 10,
        0.9
      ),
      skin
    )
  );

  // Collar / placket detail so a shirt reads as a shirt.
  if (O === 'shirt' || O === 'uniform') {
    const collar = new THREE.TorusGeometry(H * 0.044, H * 0.011, 5, detail ? 16 : 10);
    collar.rotateX(Math.PI / 2);
    collar.scale(1, 1, 0.85);
    collar.translate(0, H * 0.312, 0);
    torsoParts.push(paint(collar, topColor));
    const placket = new THREE.BoxGeometry(H * 0.016, H * 0.24, H * 0.01);
    placket.translate(0, H * 0.17, chestR * depth * 0.99);
    torsoParts.push(paint(placket, O === 'uniform' ? 0xdcd8cc : 0xffffff));
  }
  if (O === 'kurta' || O === 'dhoti') {
    const band = new THREE.TorusGeometry(H * 0.04, H * 0.009, 5, detail ? 16 : 10);
    band.rotateX(Math.PI / 2);
    band.translate(0, H * 0.316, 0);
    torsoParts.push(paint(band, topColor));
  }
  if (O === 'uniform') {
    // School tie.
    const tie = new THREE.BoxGeometry(H * 0.022, H * 0.15, H * 0.008);
    tie.translate(0, H * 0.21, chestR * depth * 1.0);
    torsoParts.push(paint(tie, 0x7d2a2f));
  }

  torso.add(meshOf(torsoParts, mat, 'torso'));

  /* --- lower body ------------------------------------------------------ */

  const legR = H * 0.046 * fat;
  const ankleR = H * 0.031;
  const trouserPuff = O === 'salwar' ? 1.7 : O === 'kurta' ? 1.25 : 1.12;

  function legGeometry(side, into) {
    const x = side * hipX;
    if (O === 'saree' || O === 'frock' || (O === 'salwar' && false)) {
      // Covered by a skirt; only the lower shin and foot are visible.
      const g = limb(ankleR * 1.15, ankleR, H * 0.11, 7, 2);
      for (const p of g) {
        p.translate(x, -(thighLen + shinLen - H * 0.11), 0);
        into.push(paint(p, skin));
      }
      return;
    }
    const upper = limb(legR * trouserPuff, legR * 0.86 * trouserPuff, thighLen, detail ? 12 : 8, 3);
    for (const p of upper) {
      p.translate(x, 0, 0);
      into.push(paint(p, legColor));
    }
    const lowerR0 = legR * 0.86 * trouserPuff;
    const cropped = O === 'uniform' || (O === 'tee' && kid) || O === 'dhoti';
    const shinCloth = cropped ? shinLen * 0.32 : shinLen;
    const lower = limb(lowerR0, cropped ? lowerR0 * 0.95 : ankleR * 1.25, shinCloth, detail ? 12 : 8, 1);
    for (const p of lower) {
      p.translate(x, -thighLen, 0);
      into.push(paint(p, legColor));
    }
    if (cropped) {
      const bare = limb(ankleR * 1.5, ankleR, shinLen - shinCloth, detail ? 10 : 7, 2);
      for (const p of bare) {
        p.translate(x, -thighLen - shinCloth, 0);
        into.push(paint(p, skin));
      }
    }
  }

  function footGeometry(side, into) {
    const x = side * hipX;
    const y = -(thighLen + shinLen);
    const shoe = new THREE.BoxGeometry(H * 0.055, H * 0.032, H * 0.13);
    shoe.translate(x, y + H * 0.016, H * 0.022);
    const toe = new THREE.SphereGeometry(H * 0.028, 8, 6);
    toe.scale(1, 0.6, 1.25);
    toe.translate(x, y + H * 0.017, H * 0.075);
    const col = O === 'uniform' ? 0x231f1c : O === 'saree' || O === 'salwar' || O === 'frock' ? 0x6b4a34 : kid ? 0x3a3f4a : 0x2e2925;
    into.push(paint(shoe, col), paint(toe, col));
  }

  // Pelvis block, always present so there is no gap under a long kurta.
  body.push(
    paint(
      lathe(
        [
          [hipR * 0.92, -H * 0.055],
          [hipR * 1.0, -H * 0.02],
          [hipR * 0.99, H * 0.012],
        ],
        detail ? 18 : 12,
        depth
      ),
      longTop || O === 'saree' ? legColor : legColor
    )
  );

  // Skirt: sari drape or frock.
  if (O === 'saree' || O === 'frock') {
    const hem = O === 'frock' ? -H * 0.22 : -(thighLen + shinLen) + H * 0.075;
    const skirt = lathe(
      O === 'frock'
        ? [
          [hipR * 1.9, hem],
          [hipR * 1.5, hem + H * 0.09],
          [hipR * 1.05, H * 0.03],
          [waistR * 0.99, H * 0.075],
        ]
        : [
          [hipR * 1.62, hem],
          [hipR * 1.42, hem + H * 0.14],
          [hipR * 1.2, -H * 0.12],
          [hipR * 1.04, -H * 0.02],
          [waistR * 1.02, H * 0.05],
        ],
      detail ? 26 : 18,
      1
    );
    // Vertical pleats — the single detail that makes a lathe read as cloth.
    const p = skirt.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * (O === 'frock' ? 14 : 11)) * 0.035;
      p.setXYZ(i, x * k, p.getY(i), z * k);
    }
    skirt.computeVertexNormals();
    body.push(paint(skirt, O === 'frock' ? c.salwar : c.saree));
  }

  if (legsArticulated) {
    // Player rig: real joints, so the walk cycle can drive them.
    const legNodes = [];
    for (const side of [1, -1]) {
      const hipJ = new THREE.Group();
      hipJ.position.set(side * hipX, 0, 0);
      hips.add(hipJ);
      const kneeJ = new THREE.Group();
      kneeJ.position.y = -thighLen;
      hipJ.add(kneeJ);

      const upperParts = [];
      const lowerParts = [];
      const savedO = O;
      void savedO;
      const upper = limb(legR * trouserPuff, legR * 0.86 * trouserPuff, thighLen, 12, 3);
      for (const p of upper) upperParts.push(paint(p, legColor));
      const lower = limb(legR * 0.86 * trouserPuff, ankleR * 1.25, shinLen, 12, 1);
      for (const p of lower) lowerParts.push(paint(p, legColor));
      const shoe = new THREE.BoxGeometry(H * 0.058, H * 0.034, H * 0.14);
      shoe.translate(0, -shinLen + H * 0.017, H * 0.024);
      const toe = new THREE.SphereGeometry(H * 0.03, 8, 6);
      toe.scale(1, 0.6, 1.25);
      toe.translate(0, -shinLen + H * 0.018, H * 0.08);
      lowerParts.push(paint(shoe, 0x3a2f26), paint(toe, 0x3a2f26));

      hipJ.add(meshOf(upperParts, mat, 'thigh'));
      kneeJ.add(meshOf(lowerParts, mat, 'shin'));
      legNodes.push({ hip: hipJ, knee: kneeJ, thighLen, shinLen, footY: -(thighLen + shinLen) });
    }
    root.userData.legs = legNodes;
  } else {
    for (const side of [1, -1]) {
      legGeometry(side, body);
      footGeometry(side, body);
    }
  }

  const hipsMesh = meshOf(body, mat, 'lower');
  if (hipsMesh) hips.add(hipsMesh);

  /* --- arms ------------------------------------------------------------ */

  const upperLen = H * (kid ? 0.15 : 0.172);
  const foreLen = H * (kid ? 0.185 : 0.205);
  // Upper arm ~10cm across on a 1.75m adult. Anything fatter and the shoulders
  // turn into the balls that make procedural people look like toys.
  const armR0 = H * 0.029 * fat;
  const armR1 = H * 0.0225 * fat;
  const sleeveR = armR0 * (O === 'kurta' || O === 'salwar' || O === 'dhoti' ? 1.32 : 1.18);

  /**
   * Arms.
   *
   * The LEFT arm is one rigid mesh with the elbow bend baked into the
   * geometry: rotating the shoulder reads as reaching or hanging without a
   * second joint, and it saves a draw call on every person in the courtyard.
   *
   * The RIGHT arm gets a real elbow. That costs one extra draw call each, and
   * it buys the one pose the whole ending depends on — a salute. A salute is
   * about 130 degrees of elbow flexion with the hand at the brow; a rigid arm
   * bent 24 degrees simply cannot make that shape, and faking it by swinging
   * the shoulder produces someone pointing vaguely at their own ear.
   */
  function buildArm(side, node, bend, jointed = false) {
    const parts = [];
    const seg = detail ? 12 : 8;

    // Deltoid. Kept just under the sleeve radius so the shoulder joint is a
    // soft transition rather than a ball socketed onto the torso.
    const d = new THREE.SphereGeometry(sleeveR * 0.97, seg, 6);
    d.scale(1.0, 1.06, 0.92);
    parts.push(paint(d, bareArms ? skin : topColor));

    // Upper arm.
    const sleeveLen = sleeveLong ? upperLen * 1.02 : upperLen * 0.62;
    for (const p of limb(sleeveR, sleeveR * 0.9, sleeveLen, seg, 2)) {
      parts.push(paint(p, bareArms && !sleeveLong ? skin : topColor));
    }
    if (!sleeveLong || bareArms) {
      for (const p of limb(armR0 * 0.94, armR0 * 0.88, upperLen - sleeveLen, seg, 2)) {
        p.translate(0, -sleeveLen, 0);
        parts.push(paint(p, skin));
      }
    }

    // Forearm and hand, built hanging from their own origin.
    const fore = [];
    for (const p of limb(armR0 * 0.9, armR1, foreLen, seg, 3)) fore.push(p);
    const hand = new THREE.SphereGeometry(armR1 * 1.28, seg, 6);
    hand.scale(0.72, 1.35, 1.0);
    hand.translate(0, -foreLen - armR1 * 0.55, 0);
    fore.push(hand);

    // A tricolour band on the wrist for some people.
    if (spec.tricolour) {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.TorusGeometry(armR1 * 1.15, armR1 * 0.16, 4, 8);
        b.rotateX(Math.PI / 2);
        b.translate(0, -foreLen * 0.86 - i * armR1 * 0.34, 0);
        fore.push(b);
      }
    }
    const foreColour = (g, i) =>
      spec.tricolour && i >= fore.length - 3 ? [0xff9933, 0xffffff, 0x138808][i - (fore.length - 3)] : skin;

    const tilt = new THREE.Matrix4().makeRotationZ(side * 0.06);

    if (jointed) {
      node.add(meshOf(parts, mat, 'upperArm'));
      const elbow = new THREE.Group();
      elbow.position.y = -upperLen;
      elbow.rotation.x = bend;
      node.add(elbow);
      const foreParts = fore.map((p, i) => paint(p.applyMatrix4(tilt), foreColour(p, i)));
      elbow.add(meshOf(foreParts, mat, 'forearm'));
      return elbow;
    }

    // Rigid: fold the elbow into the geometry.
    const m = new THREE.Matrix4()
      .makeTranslation(0, -upperLen, 0)
      .multiply(new THREE.Matrix4().makeRotationX(bend))
      .multiply(tilt);
    fore.forEach((p, i) => parts.push(paint(p.applyMatrix4(m), foreColour(p, i))));
    node.add(meshOf(parts, mat, 'arm'));
    return null;
  }

  const elbowBend = -0.42;
  buildArm(1, armL, elbowBend, false);
  const elbowR = buildArm(-1, armR, elbowBend, true);

  // Where each hand ends up. The left is expressed in its shoulder's frame
  // because that arm is rigid; the right is expressed in its elbow's frame,
  // because that is the node it now hangs from.
  const handLocal = new THREE.Vector3(0, -upperLen, 0).add(
    new THREE.Vector3(0, -(foreLen + armR1 * 0.9), 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), elbowBend)
  );
  const handLocalFore = new THREE.Vector3(0, -(foreLen + armR1 * 0.9), 0);

  /* --- drapes ---------------------------------------------------------- */

  if (O === 'saree') {
    // The pallu: over the left shoulder, down the back, round the hip.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(waistR * 0.5, H * 0.02, -chestR * depth * 0.4),
      new THREE.Vector3(chestR * 0.85, H * 0.13, -chestR * depth * 0.85),
      new THREE.Vector3(shoulderX * 0.85, H * 0.29, -chestR * depth * 0.5),
      new THREE.Vector3(shoulderX * 0.72, H * 0.315, chestR * depth * 0.45),
      new THREE.Vector3(chestR * 0.62, H * 0.2, chestR * depth * 0.92),
      new THREE.Vector3(waistR * 0.75, H * 0.02, chestR * depth * 0.8),
      new THREE.Vector3(hipR * 0.9, -H * 0.16, hipR * depth * 0.55),
    ]);
    const g = ribbon(curve, H * 0.15, 30, 0.1, H * 0.004);
    g.translate(0, 0, 0);
    torso.add(meshOf([paint(g, c.saree)], mat, 'pallu'));
  }

  if (O === 'salwar' || (O === 'frock' && spec.female)) {
    // Dupatta across the chest.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-shoulderX * 0.5, H * 0.29, -chestR * depth * 0.7),
      new THREE.Vector3(-shoulderX * 0.95, H * 0.3, chestR * depth * 0.2),
      new THREE.Vector3(-shoulderX * 0.2, H * 0.22, chestR * depth * 1.0),
      new THREE.Vector3(shoulderX * 0.6, H * 0.12, chestR * depth * 0.9),
      new THREE.Vector3(shoulderX * 0.95, H * 0.24, chestR * depth * 0.1),
      new THREE.Vector3(shoulderX * 0.7, H * 0.14, -chestR * depth * 0.85),
      new THREE.Vector3(shoulderX * 0.5, -H * 0.1, -chestR * depth * 0.7),
    ]);
    const g = ribbon(curve, H * 0.11, 28, 0.2, H * 0.003);
    torso.add(meshOf([paint(g, spec.tricolour ? 0xff9933 : c.saree)], mat, 'dupatta'));
  }

  if (O === 'dhoti' && !spec.female) {
    // A gamcha over one shoulder — instantly reads as an older man at a
    // morning function.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(shoulderX * 0.5, -H * 0.02, -chestR * depth * 0.7),
      new THREE.Vector3(shoulderX * 0.9, H * 0.24, -chestR * depth * 0.6),
      new THREE.Vector3(shoulderX * 0.85, H * 0.31, chestR * depth * 0.2),
      new THREE.Vector3(shoulderX * 0.7, H * 0.1, chestR * depth * 0.8),
      new THREE.Vector3(shoulderX * 0.6, -H * 0.1, chestR * depth * 0.7),
    ]);
    torso.add(meshOf([paint(ribbon(curve, H * 0.085, 22, 0.15, H * 0.003), 0xf6f2e6)], mat, 'gamcha'));
  }

  if (spec.stole) {
    // A tricolour stole over one shoulder — what the person who has been
    // asked to hoist the flag is usually wearing, and the one thing that
    // separates them from the crowd at a glance.
    const bands = [0xff9933, 0xf6f4ec, 0x138808];
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * H * 0.028;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-shoulderX * 0.35, -H * 0.09, -chestR * depth * 0.6),
        new THREE.Vector3(-shoulderX * 0.95, H * 0.16, -chestR * depth * 0.7),
        new THREE.Vector3(-shoulderX * 0.9 + off * 0.4, H * 0.315, -chestR * depth * 0.1),
        new THREE.Vector3(-shoulderX * 0.82 + off * 0.5, H * 0.27, chestR * depth * 0.72),
        new THREE.Vector3(-shoulderX * 0.3 + off, H * 0.08, chestR * depth * 0.95),
        new THREE.Vector3(shoulderX * 0.25 + off, -H * 0.06, chestR * depth * 0.8),
        new THREE.Vector3(shoulderX * 0.4 + off, -H * 0.19, chestR * depth * 0.66),
      ]);
      parts.push(paint(ribbon(curve, H * 0.03, 26, 0.05, H * 0.002), bands[i]));
    }
    torso.add(meshOf(parts, mat, 'stole'));
  }

  /* --- head ------------------------------------------------------------ */

  const { head: headGeo, ears } = makeHeadGeometry(headR);
  const faceKey = {
    skin: spec.skin,
    hair: spec.hair,
    female: spec.female,
    age: spec.age === 'toddler' ? 'child' : spec.age,
    beard: spec.beard,
    bindi: spec.bindi,
    glasses: spec.glasses,
    hairStyle: spec.hairStyle,
  };
  const headMesh = new THREE.Mesh(mergeGeometries([headGeo, ...ears]), faceMaterial(faceKey));
  headMesh.castShadow = true;
  headMesh.name = 'head';
  neck.add(headMesh);

  // Hair volume. The painted hairline gives the shape; this gives it mass.
  const hairCol = spec.hair < 0 ? 0xb5afa6 : [0x1b1512, 0x241a15, 0x2f2119, 0x3a2a1e, 0x141010][spec.hair % 5];
  const hairParts = [];
  const hy = headR * 1.06;
  if (spec.hairStyle !== 'bald') {
    // Tilted very slightly FORWARD and taken well down the sides. Tipping the
    // cap back — which looks right in isolation — leaves a bare dome of
    // forehead above the painted hairline, and that single mistake is what
    // makes a procedural head read as a mannequin.
    const cap = new THREE.SphereGeometry(headR * 1.05, detail ? 20 : 14, detail ? 15 : 11, 0, TAU, 0, 1.34);
    cap.scale(0.96, 1.1, 1.0);
    cap.rotateX(0.1);
    cap.translate(0, hy + headR * 0.02, -headR * 0.02);
    hairParts.push(paint(cap, hairCol));
  }
  if (spec.hairStyle === 'open' || spec.hairStyle === 'plait') {
    const curtain = new THREE.CylinderGeometry(headR * 1.02, headR * 1.12, headR * 1.5, detail ? 18 : 12, 1, true, 0.55, TAU - 1.1);
    curtain.scale(1, 1, 1.0);
    curtain.translate(0, hy - headR * 0.5, 0);
    hairParts.push(paint(curtain, hairCol));
  }
  if (spec.hairStyle === 'plait') {
    const braid = limb(headR * 0.4, headR * 0.16, H * 0.2, 7, 2);
    for (const p of braid) {
      p.translate(0, hy - headR * 1.1, -headR * 0.85);
      hairParts.push(paint(p, hairCol));
    }
  }
  if (spec.hairStyle === 'bun') {
    const bun = new THREE.SphereGeometry(headR * 0.46, detail ? 14 : 10, detail ? 12 : 8);
    bun.scale(1, 0.9, 0.85);
    bun.translate(0, hy + headR * 0.32, -headR * 1.02);
    hairParts.push(paint(bun, hairCol));
    const gajra = new THREE.TorusGeometry(headR * 0.5, headR * 0.09, 5, 12);
    gajra.rotateX(0.5);
    gajra.translate(0, hy + headR * 0.28, -headR * 0.95);
    hairParts.push(paint(gajra, 0xf2f0e4));
  }
  if (spec.topi) {
    // Gandhi topi.
    const topi = new THREE.CylinderGeometry(headR * 1.02, headR * 1.06, headR * 0.62, detail ? 18 : 12, 1, false);
    topi.scale(1, 1, 0.92);
    topi.translate(0, hy + headR * 0.82, -headR * 0.03);
    hairParts.push(paint(topi, 0xf7f4ea));
  }
  const hairMesh = meshOf(hairParts, mat, 'hair');
  if (hairMesh) neck.add(hairMesh);

  /* --- props ----------------------------------------------------------- */

  let propNode = null;
  if (spec.prop === 'flag') {
    propNode = new THREE.Group();
    const scale = kid ? 0.8 : 1;
    const stick = new THREE.CylinderGeometry(H * 0.006, H * 0.006, H * 0.28 * scale, 6);
    stick.translate(0, H * 0.1 * scale, 0);
    const parts = [paint(stick, 0xa8845a)];
    const bands = [0xff9933, 0xffffff, 0x138808];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.PlaneGeometry(H * 0.13 * scale, H * 0.029 * scale);
      b.translate(H * 0.072 * scale, H * 0.215 * scale - i * H * 0.029 * scale, 0);
      parts.push(paint(b, bands[i]));
    }
    const chakra = new THREE.CircleGeometry(H * 0.011 * scale, 10);
    chakra.translate(H * 0.072 * scale, H * 0.186 * scale, 0.001);
    parts.push(paint(chakra, 0x11136b));
    propNode.add(meshOf(parts, mat, 'handflag'));
    // Held in the LEFT hand, deliberately. The right hand has to stay free to
    // go to the brow: at a real hoisting the people holding little flags
    // salute too, they just do it round the flag.
    propNode.position.copy(handLocal);
    propNode.rotation.set(-elbowBend, 0, -0.18);
    armL.add(propNode);
  } else if (spec.prop === 'phone') {
    propNode = new THREE.Group();
    const body2 = new THREE.BoxGeometry(H * 0.042, H * 0.082, H * 0.008);
    const screen = new THREE.PlaneGeometry(H * 0.036, H * 0.074);
    screen.translate(0, 0, H * 0.005);
    propNode.add(meshOf([paint(body2, 0x1b1c20), paint(screen, 0x5d6f80)], mat, 'phone'));
    propNode.position.copy(handLocalFore);
    propNode.rotation.x = 0.4;
    elbowR.add(propNode);
  }

  /* --- ground the whole thing ----------------------------------------- */
  //
  // The one guarantee this scene cannot afford to get wrong. Rather than
  // trusting the arithmetic above, measure the assembled body and push it so
  // the lowest vertex is exactly on y = 0.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const footOffset = Number.isFinite(box.min.y) ? -box.min.y : 0;
  root.position.y = footOffset;
  const measuredHeight = box.max.y - box.min.y;

  return {
    root,
    spec,
    hips,
    torso,
    neck,
    armL,
    armR,
    elbowR,
    elbowBend,
    legs: root.userData.legs ?? null,
    handLocal,
    handLocalFore,
    height: measuredHeight,
    /**
     * How far the root has to sit above the surface for the soles to touch it.
     * Anyone repositioning this person must add it rather than overwrite y —
     * that is the whole no-floating contract.
     */
    footOffset,
    shoulderY: HIP_Y + SHOULDER_LOCAL,
    /** Local offset of the hand from the shoulder node, for rope gripping. */
    armLengths: { upper: upperLen, fore: foreLen },
  };
}

/* ------------------------------------------------------------------ */
/* posing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Idle and reaction behaviour for a crowd member.
 *
 * Everything here moves the body *above* the ankles — a lean, a sway, a turn
 * of the head, arms from the shoulder. The feet are never touched, which is
 * how the no-floating guarantee survives contact with animation.
 */
export function makeBehaviour(person, r) {
  const { torso, neck, armL, armR, elbowR, elbowBend, spec } = person;
  const phase = r.range(0, TAU);
  const rate = r.range(0.55, 0.95);
  const kid = spec.age === 'child' || spec.age === 'toddler';

  /**
   * Resting arm angles, as shoulder Euler triples.
   *
   * The arm is one rigid piece with the elbow bend already in it, so `x`
   * swings the whole arm forward and `z` swings it away from the body. Keeping
   * `z` under about 0.15 radians is what stops a standing crowd reading as a
   * field of T-poses — an arm hanging by a side is very nearly vertical, and
   * even a few degrees too many looks like a scarecrow.
   */
  const activity = spec.prop === 'phone' ? 'phone' : spec.activity;
  //
  // Note what is NOT here: arms folded across the chest. A rigid arm cannot
  // fold — both forearms end up pointing straight forward, which from the side
  // reads as two poles sticking out of a person's ribs. Every resting pose
  // below keeps the forearms close to vertical or tucked in front.
  const rest = {
    watch: { l: [0.05, 0, 0.07], r: [0.05, 0, -0.07] },
    talk: { l: [0.12, 0, 0.06], r: [-0.5, -0.16, -0.12] },
    clasp: { l: [0.46, 0, -0.13], r: [0.46, 0, 0.13] }, // hands together in front
    hips: { l: [0.24, 0, 0.26], r: [0.24, 0, -0.26] }, // thumbs hooked at the waist
    phone: { l: [0.08, 0, 0.08], r: [-1.42, -0.12, -0.2] },
  }[activity] ?? { l: [0.05, 0, 0.07], r: [0.05, 0, -0.07] };

  if (spec.prop === 'flag') {
    // The flag is in the left hand now, so it is the left arm that carries it.
    rest.l = [-0.42, 0.06, 0.14];
  }

  /**
   * What this person does the moment the tricolour opens.
   *
   * Overwhelmingly: they salute. That is what actually happens in a courtyard
   * on 15 August — the flag goes up, everyone comes to attention and the hand
   * goes to the brow, and it holds for the anthem. The previous version had
   * the whole crowd throwing both arms in the air like a stadium, which read
   * as a goal celebration rather than a national salute.
   *
   * Around that: people holding flags raise them, people with phones film,
   * a few older residents fold their hands, and a handful of children clap and
   * bounce because children do.
   */
  const reaction = spec.prop === 'phone'
    ? 'film'
    : kid
      ? r.weighted([['salute', 54], ['clap', 30], ['cheer', 16]])
      : r.weighted([['salute', 68], ['namaste', 16], ['clap', 16]]);

  // Not everyone comes to attention at the same instant — a real crowd takes
  // a beat to notice, and the stragglers are what stop it looking choreographed.
  const delay = r.range(0, 0.55) + (reaction === 'salute' ? r.range(0, 0.3) : 0);
  const lookUpBase = r.range(0, 1);
  const bodyYaw = torso.rotation.y;
  const restElbow = elbowBend;
  const hasFlag = spec.prop === 'flag';

  // The salute itself. The upper arm goes out to the side and slightly
  // forward; the elbow folds to about 130 degrees, which walks the hand up and
  // inward until it sits at the brow. Both halves are needed — the shoulder
  // alone puts the hand somewhere out past the ear.
  const SALUTE_SHOULDER = [-1.24, 0.6, -1.2];
  const SALUTE_ELBOW = -2.24;

  const _l = [0, 0, 0];
  const _r = [0, 0, 0];
  const mix = (out, a, b, k) => {
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  };

  return {
    reaction,
    update(t, react0, hoist) {
      // Each person's own ramp, so the crowd turns over a second or so.
      const react = THREE.MathUtils.clamp((react0 - delay) / (1 - delay), 0, 1);
      const k = react * react * (3 - 2 * react);

      const s = Math.sin(t * rate + phase);
      const s2 = Math.sin(t * rate * 1.7 + phase * 1.3);
      const beat = t * 6.4 + phase;

      // Idle: weight shift and breathing, from the waist up.
      torso.rotation.z = s * 0.016 * (1 - k * 0.8);
      torso.rotation.y = bodyYaw + s2 * 0.03 * (1 - k * 0.8);
      torso.rotation.x = 0.01 + s * 0.008;

      // Heads follow the flag as it climbs, then hold on it.
      const look = -(0.12 + hoist * 0.5) * (0.55 + lookUpBase * 0.5) - k * 0.16;
      neck.rotation.x = look;
      neck.rotation.y = s2 * 0.09 * (1 - k);

      mix(_l, rest.l, rest.l, 0);
      mix(_r, rest.r, rest.r, 0);
      let elbow = restElbow;

      if (k > 0.001) {
        switch (reaction) {
          case 'salute': {
            // Stand up straight, chin up, and hold it. No wobble: a salute
            // that sways is not a salute.
            mix(_l, rest.l, hasFlag ? [-1.62, 0.05, 0.2] : [0.03, 0, 0.045], k);
            mix(_r, rest.r, SALUTE_SHOULDER, k);
            elbow = THREE.MathUtils.lerp(restElbow, SALUTE_ELBOW, k);
            torso.rotation.x = 0.01 - k * 0.03;
            torso.rotation.z *= 1 - k;
            break;
          }
          case 'namaste': {
            // Palms together at the chest, head dipped.
            mix(_l, rest.l, [0.62, 0, -0.2], k);
            mix(_r, rest.r, [0.62, 0, 0.2], k);
            elbow = THREE.MathUtils.lerp(restElbow, -1.62, k);
            neck.rotation.x = look + k * 0.3;
            break;
          }
          case 'film': {
            mix(_r, rest.r, [-1.5, -0.1, -0.24], k);
            mix(_l, rest.l, [-1.2, 0.18, 0.36], k);
            elbow = THREE.MathUtils.lerp(restElbow, -1.15, k);
            break;
          }
          case 'clap': {
            const c = (Math.sin(beat) * 0.5 + 0.5) ** 1.6;
            mix(_l, rest.l, [-0.98, 0, -0.12 - c * 0.16], k);
            mix(_r, rest.r, [-0.98, 0, 0.1 + c * 0.16], k);
            elbow = THREE.MathUtils.lerp(restElbow, -1.34 - c * 0.2, k);
            torso.rotation.z += Math.sin(beat * 0.5) * 0.02 * k;
            break;
          }
          default: {
            // cheer — arms up, but not straight up: a raised, open gesture.
            const c = Math.sin(beat * 0.6) * 0.16;
            mix(_l, rest.l, [-2.25 + c, 0, 0.34], k);
            mix(_r, rest.r, [-2.25 - c, 0, -0.34], k);
            elbow = THREE.MathUtils.lerp(restElbow, -0.62, k);
            torso.rotation.x -= k * 0.07;
            torso.rotation.z += Math.sin(beat * 0.5) * 0.035 * k * (kid ? 2.2 : 1);
            break;
          }
        }
      }

      // The sway fades out as the pose takes hold, so a salute is still.
      const sway = s * 0.045 * (1 - k);
      armL.rotation.set(_l[0] + sway, _l[1], _l[2]);
      armR.rotation.set(_r[0] - sway, _r[1], _r[2]);
      if (elbowR) elbowR.rotation.x = elbow;
    },
  };
}
