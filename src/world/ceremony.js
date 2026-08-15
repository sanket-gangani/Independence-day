import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/rng.js';
import { makeMarigoldSprite, makeBannerTexture, makeConcreteTexture } from '../core/textures.js';

/**
 * The ceremony.
 *
 * A flagpole on its own is a flagpole. What makes it read instantly as an
 * Indian Independence Day function is everything arranged around it: the
 * trestle table under a white cloth with a satin runner, Gandhiji's framed
 * photograph garlanded with marigolds and flanked by two other leaders, the
 * brass diya, the steel water jug and tumblers, the printed vinyl banner
 * strung between two bamboo poles, the rows of white plastic chairs, the mic
 * on its stand wired to a horn speaker, the red durrie the children sit on,
 * and marigold garlands looped between everything.
 *
 * Anybody who has stood in a school or society courtyard on 15 August
 * recognises this arrangement in under a second. That recognition is the
 * entire point of this file.
 *
 * PORTRAITS
 * ---------
 * Real photographs are loaded from public/portraits/. No likeness is ever
 * synthesised — a procedurally faked face of a national figure would be both
 * crude and disrespectful — so if a file is missing the frame falls back to a
 * neutral sepia card and the name plate underneath still reads correctly.
 */

const PORTRAITS = [
  { file: 'portraits/gandhi.jpg', label: 'Mahatma Gandhi' },
  { file: 'portraits/leader-3.jpg', label: 'Sardar Patel' },
  { file: 'portraits/leader-4.jpg', label: 'Subhas Chandra Bose' },
];

function makePortraitPlaceholder(label) {
  const W = 384;
  const H = 480;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e8dcc4');
  g.addColorStop(1, '#cdbb9a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.44, W * 0.12, W / 2, H * 0.5, W * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(60,44,26,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(92,70,44,0.55)';
  ctx.textAlign = 'center';
  ctx.font = '600 22px Georgia, serif';
  ctx.fillText(label, W / 2, H - 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nameplateTexture(label) {
  const W = 512;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3ecdc';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = '#2b3a5c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 40px Georgia, serif';
  ctx.fillText(label, W / 2, H / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCeremony(scene) {
  const group = new THREE.Group();
  group.name = 'ceremony';
  const r = rng(1947);

  const marigoldTex = makeMarigoldSprite();
  const marigoldMat = new THREE.MeshStandardMaterial({
    map: marigoldTex,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const concrete = makeConcreteTexture();

  const clothMat = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.96 });
  const satinMat = new THREE.MeshStandardMaterial({ color: 0xa8253a, roughness: 0.55, metalness: 0.06 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5433, roughness: 0.82 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.3, metalness: 0.75 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc09232, roughness: 0.34, metalness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.6, metalness: 0.3 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0xe0ddd2, roughness: 0.62 });
  const bambooMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xb5a068, roughness: 0.9 });

  /** Loops of marigolds hung between two points. */
  function garlandBetween(a, b, sag, count, into, size = 0.14) {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateY(r.range(0, 3.14));
      g.rotateX(r.range(-0.5, 0.5));
      g.translate(p.x, p.y, p.z);
      into.push(g);
    }
  }

  const garlandGeo = [];

  /* --- the table -------------------------------------------------------- */

  const TABLE_Z = -6.6;
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 0.9), woodMat);
  tableTop.position.set(0, 0.9, TABLE_Z);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  group.add(tableTop);
  for (const sx of [-1.5, 1.5]) {
    for (const sz of [-0.34, 0.34]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.88, 0.07), woodMat);
      leg.position.set(sx, 0.44, TABLE_Z + sz);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // White cloth over it, hanging down the front, with a satin runner.
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.03, 1.06), clothMat);
  cloth.position.set(0, 0.945, TABLE_Z);
  cloth.receiveShadow = true;
  group.add(cloth);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(3.62, 0.86, 24, 1), clothMat);
  {
    // Gathered folds along the front, so the cloth is not a card.
    const p = skirt.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setZ(i, Math.sin(p.getX(i) * 7.5) * 0.035 * (0.4 + (0.5 - p.getY(i) / 0.86)));
    }
    skirt.geometry.computeVertexNormals();
  }
  skirt.material = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.96, side: THREE.DoubleSide });
  skirt.position.set(0, 0.51, TABLE_Z + 0.53);
  skirt.receiveShadow = true;
  group.add(skirt);

  const runner = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.02, 0.34), satinMat);
  runner.position.set(0, 0.965, TABLE_Z - 0.02);
  group.add(runner);
  // Frilled edge of the runner over the front lip.
  const frill = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.3), satinMat);
  frill.position.set(0, 0.82, TABLE_Z + 0.545);
  group.add(frill);

  /* --- portraits -------------------------------------------------------- */

  function framedPortrait({ file, label, width, x, y, z, ry = 0, easel = false }) {
    const g = new THREE.Group();
    const height = width * 1.26;

    const photoMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 });
    photoMat.map = makePortraitPlaceholder(label);
    new THREE.TextureLoader().load(
      file,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        photoMat.map = tex;
        photoMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    // Mount board first, then the photograph on top of it, then the frame, then
    // the glass. The z values are not decorative: the mount is a *box*, and if
    // its front face lands in front of the photo plane the frame comes out
    // blank — which is exactly what it did.
    const mount = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.09, height + 0.09, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.9 })
    );
    mount.position.z = 0.02; // front face at 0.030
    g.add(mount);

    const photo = new THREE.Mesh(new THREE.PlaneGeometry(width, height), photoMat);
    photo.position.z = 0.036;
    g.add(photo);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.17, height + 0.17, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x6a4526, roughness: 0.45, metalness: 0.15 })
    );
    frame.castShadow = true;
    g.add(frame);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        color: 0xdfe9f2, transparent: true, opacity: 0.09, roughness: 0.06, metalness: 0.4,
      })
    );
    glass.position.z = 0.043;
    g.add(glass);

    // Marigold garland over the top corners, hanging down both sides — the
    // way a portrait is always garlanded at a function.
    const gg = [];
    garlandBetween(
      new THREE.Vector3(-width * 0.56, height * 0.44, 0.06),
      new THREE.Vector3(width * 0.56, height * 0.44, 0.06),
      -height * 0.08, 18, gg, width * 0.19
    );
    garlandBetween(
      new THREE.Vector3(-width * 0.56, height * 0.44, 0.06),
      new THREE.Vector3(-width * 0.5, -height * 0.36, 0.06),
      -width * 0.14, 10, gg, width * 0.19
    );
    garlandBetween(
      new THREE.Vector3(width * 0.56, height * 0.44, 0.06),
      new THREE.Vector3(width * 0.5, -height * 0.36, 0.06),
      -width * 0.14, 10, gg, width * 0.19
    );
    const garland = new THREE.Mesh(mergeGeometries(gg), marigoldMat);
    garland.castShadow = true;
    g.add(garland);

    // Name plate.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.86, width * 0.16),
      new THREE.MeshStandardMaterial({ map: nameplateTexture(label), roughness: 0.8 })
    );
    plate.position.set(0, -height / 2 - width * 0.14, 0.05);
    plate.rotation.x = -0.3;
    g.add(plate);

    if (easel) {
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, y * 1.02, 6), woodMat);
        leg.position.set(side * width * 0.4, -height / 2 - y * 0.5 + 0.06, -0.16);
        leg.rotation.z = side * 0.075;
        leg.rotation.x = 0.16;
        leg.castShadow = true;
        g.add(leg);
      }
      const rung = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.05), woodMat);
      rung.position.set(0, -height / 2 - 0.02, -0.02);
      g.add(rung);
    } else {
      // Propped on a small stand on the table.
      const prop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), woodMat);
      prop.position.set(0, -height / 2 + 0.02, -0.14);
      prop.rotation.x = 0.5;
      g.add(prop);
    }

    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.rotation.x = easel ? 0 : -0.08;
    group.add(g);
    return g;
  }

  // Gandhiji, centre, largest, on the table itself.
  framedPortrait({ ...PORTRAITS[0], width: 0.62, x: 0, y: 1.42, z: TABLE_Z - 0.12 });
  // Two more either side, on easels so they stand at the same eyeline.
  framedPortrait({ ...PORTRAITS[1], width: 0.44, x: -1.28, y: 1.34, z: TABLE_Z + 0.05, ry: 0.3 });
  framedPortrait({ ...PORTRAITS[2], width: 0.44, x: 1.28, y: 1.34, z: TABLE_Z + 0.05, ry: -0.3 });

  /* --- things on the table ---------------------------------------------- */

  // Brass diya, lit.
  const diyaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.05, 14), brassMat);
  diyaBase.position.set(-0.62, 1.0, TABLE_Z + 0.2);
  group.add(diyaBase);
  const diyaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), brassMat);
  diyaStem.position.set(-0.62, 1.08, TABLE_Z + 0.2);
  group.add(diyaStem);
  const diyaBowl = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, 6.28, 0, 1.4), brassMat);
  diyaBowl.rotation.x = Math.PI;
  diyaBowl.position.set(-0.62, 1.17, TABLE_Z + 0.2);
  group.add(diyaBowl);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd489, emissive: 0xff9c26, emissiveIntensity: 3, roughness: 1 })
  );
  flame.position.set(-0.62, 1.24, TABLE_Z + 0.2);
  group.add(flame);
  const flameLight = new THREE.PointLight(0xffa63a, 0.7, 2.6, 2);
  flameLight.position.copy(flame.position);
  group.add(flameLight);

  // Steel jug and tumblers.
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.24, 14), steelMat);
  jug.position.set(1.22, 1.06, TABLE_Z + 0.16);
  jug.castShadow = true;
  group.add(jug);
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.09, 10), steelMat);
    cup.position.set(1.45 + i * 0.085, 0.99, TABLE_Z + 0.24 - i * 0.03);
    group.add(cup);
  }

  // Tray of loose marigolds and rose petals for the offering.
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.04, 18), steelMat);
  tray.position.set(0.62, 0.98, TABLE_Z + 0.2);
  group.add(tray);
  const trayFlowers = [];
  for (let i = 0; i < 22; i++) {
    const a = r.range(0, 6.28);
    const rr = r.range(0, 0.17);
    const g = new THREE.PlaneGeometry(0.075, 0.075);
    g.rotateX(-Math.PI / 2 + r.range(-0.5, 0.5));
    g.rotateY(a);
    g.translate(0.62 + Math.cos(a) * rr, 1.02 + r.range(0, 0.02), TABLE_Z + 0.2 + Math.sin(a) * rr);
    trayFlowers.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(trayFlowers), marigoldMat));

  // Garland looped along the front lip of the table.
  garlandBetween(
    new THREE.Vector3(-1.7, 0.95, TABLE_Z + 0.55),
    new THREE.Vector3(0, 0.95, TABLE_Z + 0.55),
    -0.22, 20, garlandGeo, 0.13
  );
  garlandBetween(
    new THREE.Vector3(0, 0.95, TABLE_Z + 0.55),
    new THREE.Vector3(1.7, 0.95, TABLE_Z + 0.55),
    -0.22, 20, garlandGeo, 0.13
  );

  /* --- banner ------------------------------------------------------------ */

  const bannerMat = new THREE.MeshStandardMaterial({
    map: makeBannerTexture(), roughness: 0.92, side: THREE.DoubleSide,
  });
  const bannerGeo = new THREE.PlaneGeometry(7.6, 1.52, 40, 6);
  {
    // Vinyl banners always sag between their tie points and ripple.
    const p = bannerGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 7.6;
      p.setY(i, p.getY(i) - Math.cos(u * Math.PI) * 0.0 - (1 - Math.cos(u * Math.PI * 2)) * 0.06);
      p.setZ(i, Math.sin(u * 9) * 0.045);
    }
    bannerGeo.computeVertexNormals();
  }
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 3.05, TABLE_Z - 1.5);
  banner.castShadow = true;
  group.add(banner);

  for (const sx of [-4.1, 4.1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 4.2, 8), bambooMat);
    pole.position.set(sx, 2.1, TABLE_Z - 1.5);
    pole.castShadow = true;
    group.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.18, 12), darkMat);
    foot.position.set(sx, 0.09, TABLE_Z - 1.5);
    group.add(foot);
  }

  /* --- PA system --------------------------------------------------------- */

  const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.42, 8), darkMat);
  micStand.position.set(-2.1, 0.71, TABLE_Z + 1.0);
  micStand.castShadow = true;
  group.add(micStand);
  const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 14), darkMat);
  micBase.position.set(-2.1, 0.02, TABLE_Z + 1.0);
  group.add(micBase);
  const micArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), darkMat);
  micArm.rotation.z = -0.9;
  micArm.position.set(-2.02, 1.44, TABLE_Z + 1.0);
  group.add(micArm);
  const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.08, 4, 10), darkMat);
  mic.rotation.z = -0.9;
  mic.rotation.x = 0.4;
  mic.position.set(-1.92, 1.5, TABLE_Z + 1.05);
  group.add(mic);

  // Horn speakers on a stand — the ones that make everything sound like a
  // railway announcement, and are at every function in the country.
  for (const side of [-1, 1]) {
    const x = side * 4.9;
    const z = TABLE_Z + 0.6;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), darkMat);
    mast.position.set(x, 1.3, z);
    mast.castShadow = true;
    group.add(mast);
    for (const [ly, lz] of [[-0.9, 0.4], [-0.9, -0.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), darkMat);
      leg.position.set(x, 0.42, z + lz);
      leg.rotation.x = lz > 0 ? 0.45 : -0.45;
      group.add(leg);
      void ly;
    }
    for (let i = 0; i < 2; i++) {
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.09, 0.5, 12, 1, true), darkMat);
      horn.rotation.z = Math.PI / 2;
      horn.rotation.y = side * (0.5 + i * 0.55);
      horn.position.set(x - side * 0.2, 2.5 - i * 0.16, z + (i ? 0.28 : -0.28));
      horn.castShadow = true;
      group.add(horn);
    }
  }
  // The amplifier on a plastic stool, with a cable snaking to the mic.
  const amp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.34), darkMat);
  amp.position.set(-3.2, 0.62, TABLE_Z + 1.3);
  amp.castShadow = true;
  group.add(amp);
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.46, 12), chairMat);
  stool.position.set(-3.2, 0.23, TABLE_Z + 1.3);
  group.add(stool);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.0, 0.5, TABLE_Z + 1.3),
        new THREE.Vector3(-2.7, 0.02, TABLE_Z + 1.5),
        new THREE.Vector3(-2.3, 0.02, TABLE_Z + 1.15),
        new THREE.Vector3(-2.1, 0.02, TABLE_Z + 1.0),
      ]), 20, 0.012, 5, false
    ),
    darkMat
  );
  group.add(cable);

  /* --- chairs ------------------------------------------------------------ */

  function chairGeometries() {
    const parts = [];
    const seat = new THREE.BoxGeometry(0.44, 0.05, 0.42);
    seat.translate(0, 0.44, 0);
    parts.push(seat);
    const back = new THREE.BoxGeometry(0.44, 0.5, 0.045);
    back.translate(0, 0.71, -0.19);
    parts.push(back);
    // The two slots in a monobloc backrest.
    for (const y of [0.62, 0.78]) {
      const slot = new THREE.BoxGeometry(0.3, 0.035, 0.06);
      slot.translate(0, y, -0.19);
      parts.push(slot);
    }
    for (const [x, z] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) {
      const leg = new THREE.BoxGeometry(0.04, 0.44, 0.04);
      leg.translate(x, 0.22, z);
      parts.push(leg);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.BoxGeometry(0.05, 0.04, 0.36);
      arm.translate(side * 0.22, 0.62, -0.02);
      parts.push(arm);
      const post = new THREE.BoxGeometry(0.05, 0.2, 0.05);
      post.translate(side * 0.22, 0.52, 0.14);
      parts.push(post);
    }
    return mergeGeometries(parts);
  }

  const chairGeo = chairGeometries();
  const CHAIRS = 16;
  const chairs = new THREE.InstancedMesh(chairGeo, chairMat, CHAIRS);
  chairs.castShadow = true;
  chairs.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let n = 0;
  // Two short rows to one side of the pole, facing it, the way the chairs for
  // the elders always end up.
  for (let row = 0; row < 2 && n < CHAIRS; row++) {
    for (let i = 0; i < 8 && n < CHAIRS; i++) {
      const a = -1.28 - i * 0.115;
      const rad = 6.6 + row * 0.95;
      dummy.position.set(Math.sin(a) * rad + r.range(-0.07, 0.07), 0.145, Math.cos(a) * rad + r.range(-0.07, 0.07));
      dummy.rotation.set(0, Math.atan2(-Math.sin(a), -Math.cos(a)) + r.range(-0.16, 0.16), 0);
      dummy.updateMatrix();
      chairs.setMatrixAt(n++, dummy.matrix);
    }
  }
  chairs.count = n;
  chairs.instanceMatrix.needsUpdate = true;
  group.add(chairs);

  // A shawl left over the back of one chair, a cloth bag on another. Nothing
  // says "people are here" like the things they put down.
  const shawl = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.6, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.95, side: THREE.DoubleSide })
  );
  {
    const p = shawl.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 10) * 0.02);
    shawl.geometry.computeVertexNormals();
  }
  const c0 = new THREE.Matrix4();
  chairs.getMatrixAt(2, c0);
  shawl.position.setFromMatrixPosition(c0);
  shawl.position.y += 0.72;
  shawl.rotation.y = new THREE.Euler().setFromRotationMatrix(c0).y;
  group.add(shawl);

  /* --- durrie for the children ------------------------------------------- */

  const durrieMat = new THREE.MeshStandardMaterial({ color: 0x9c3040, roughness: 0.98 });
  const durrie = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.4, 10, 6), durrieMat);
  {
    const p = durrie.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3) * 0.012 + r.range(-0.006, 0.006));
    durrie.geometry.computeVertexNormals();
  }
  durrie.rotation.x = -Math.PI / 2;
  durrie.rotation.z = 0.16;
  durrie.position.set(4.6, 0.152, -3.6);
  durrie.receiveShadow = true;
  group.add(durrie);
  const durrieEdge = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.012, 0.16), satinMat);
  durrieEdge.rotation.y = 0.16;
  durrieEdge.position.set(4.6, 0.156, -2.42);
  group.add(durrieEdge);

  /* --- bunting ----------------------------------------------------------- */
  //
  // Strung from the pole out to the street lights: the universal signal that
  // something is being celebrated here today.

  const bunt = { saffron: [], white: [], green: [] };
  const keys = ['saffron', 'white', 'green'];

  // Strung around the edge of the courtyard, pole to pole — not radiating from
  // the flagpole. Lines running to the mast would cross the tricolour as it
  // opens, and nothing is allowed to cut across the flag.
  //
  // Both the radius and the height matter: the cinematic camera arcs round the
  // ceremony at about thirteen to fifteen metres and three to four metres up,
  // so the bunting is strung wider than that and high enough that the camera
  // passes underneath it rather than through a pennant.
  const anchors = [];
  const RING = 16.6;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    anchors.push(new THREE.Vector3(Math.sin(a) * RING, 7.1 + (i % 2) * 0.4, Math.cos(a) * RING));
  }
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i];
    const to = anchors[(i + 1) % anchors.length];
    const flags = 16;
    const facing = Math.atan2(-(from.x + to.x) / 2, -(from.z + to.z) / 2);
    for (let f = 1; f < flags; f++) {
      const t = f / flags;
      const p = from.clone().lerp(to, t);
      p.y -= Math.sin(t * Math.PI) * 1.55;
      const tri = new THREE.ConeGeometry(0.17, 0.46, 3);
      tri.rotateX(Math.PI);
      tri.rotateY(facing);
      tri.translate(p.x, p.y - 0.22, p.z);
      bunt[keys[f % 3]].push(tri);
    }
    const pts = [];
    for (let t = 0; t <= 10; t++) {
      const f = t / 10;
      const p = from.clone().lerp(to, f);
      p.y -= Math.sin(f * Math.PI) * 1.55;
      pts.push(p);
    }
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.014, 4, false), darkMat)
    );
    // The bamboo it is tied to.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, from.y, 7), bambooMat);
    mast.position.set(from.x, from.y / 2, from.z);
    mast.castShadow = true;
    group.add(mast);
  }
  const buntColors = { saffron: 0xff9933, white: 0xf4f2ea, green: 0x138808 };
  for (const key of keys) {
    const m = new THREE.Mesh(
      mergeGeometries(bunt[key]),
      new THREE.MeshStandardMaterial({ color: buntColors[key], roughness: 0.9, side: THREE.DoubleSide })
    );
    m.castShadow = true;
    group.add(m);
  }

  /* --- flower baskets and the last odds and ends ------------------------- */

  for (const [bx, bz] of [[-1.5, -4.6], [1.5, -4.6], [-2.6, -5.6], [2.6, -5.6]]) {
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.19, 0.28, 12), bambooMat);
    basket.position.set(bx, 0.29, bz);
    basket.castShadow = true;
    group.add(basket);
    const heap = [];
    for (let i = 0; i < 18; i++) {
      const a = r.range(0, 6.28);
      const rr = r.range(0, 0.22);
      const g = new THREE.PlaneGeometry(0.11, 0.11);
      g.rotateX(-Math.PI / 2 + r.range(-0.7, 0.7));
      g.rotateY(a);
      g.translate(bx + Math.cos(a) * rr, 0.44 + r.range(0, 0.05) - rr * 0.3, bz + Math.sin(a) * rr);
      heap.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(heap), marigoldMat));
  }

  // The garlands strung across the whole ceremonial area.
  garlandBetween(new THREE.Vector3(-4.1, 3.6, TABLE_Z - 1.5), new THREE.Vector3(0, 3.6, TABLE_Z - 1.5), -0.4, 22, garlandGeo, 0.15);
  garlandBetween(new THREE.Vector3(0, 3.6, TABLE_Z - 1.5), new THREE.Vector3(4.1, 3.6, TABLE_Z - 1.5), -0.4, 22, garlandGeo, 0.15);
  const garlands = new THREE.Mesh(mergeGeometries(garlandGeo), marigoldMat);
  garlands.castShadow = true;
  group.add(garlands);

  scene.add(group);
  return {
    group,
    flameLight,
    update(t) {
      // The diya gutters.
      const f = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 3.3) * 0.08;
      flame.scale.set(0.9 + f * 0.1, f, 0.9 + f * 0.1);
      flameLight.intensity = 0.6 * f;
    },
  };
}
