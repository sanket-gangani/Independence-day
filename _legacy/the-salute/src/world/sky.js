import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { makeGlowSprite } from '../core/textures.js';

/**
 * The sunrise. Everything visual that changes over the course of the
 * experience — sky gradient, fog, sun height, key light, ambient bounce —
 * hangs off a single 0..1 progress value so the climax is easy to time.
 */

const SUN_DISTANCE = 900;

// Keyframed palette. Cold violet pre-dawn through to warm gold.
const KEYS = [
  {
    t: 0.0,
    zenith: 0x1e2a5c,
    horizon: 0x5b4d74,
    horizonCool: 0x2a3260,
    sun: 0x6a5a84,
    glow: 0.12,
    elev: -4.0,
    lightColor: 0x6b7cb4,
    lightIntensity: 0.95,
    hemiSky: 0x74809e,
    hemiGround: 0x3d4356,
    hemiIntensity: 4.0,
    groundColor: 0xc4ccdc,
    groundEmissive: 0x1b2138,
    groundEmissiveI: 0.32,
    exposure: 1.05,
    bloom: 0.28,
  },
  {
    t: 0.34,
    zenith: 0x223464,
    horizon: 0xa06a5c,
    horizonCool: 0x33406e,
    sun: 0xd9744f,
    glow: 0.4,
    elev: 0.4,
    lightColor: 0xc4785f,
    lightIntensity: 1.9,
    hemiSky: 0x8b8fae,
    hemiGround: 0x504b60,
    hemiIntensity: 3.0,
    groundColor: 0xd2ccd6,
    groundEmissive: 0x211b33,
    groundEmissiveI: 0.24,
    exposure: 1.1,
    bloom: 0.42,
  },
  {
    t: 0.62,
    zenith: 0x36609e,
    horizon: 0xe08a52,
    horizonCool: 0x4a6ea2,
    sun: 0xffb877,
    glow: 0.72,
    elev: 5.5,
    lightColor: 0xffab63,
    lightIntensity: 2.7,
    hemiSky: 0x93a8d4,
    hemiGround: 0x5e5647,
    hemiIntensity: 2.6,
    groundColor: 0xdcdcea,
    groundEmissive: 0x241c30,
    groundEmissiveI: 0.16,
    exposure: 1.06,
    bloom: 0.4,
  },
  {
    t: 1.0,
    zenith: 0x5b93d6,
    horizon: 0xffd39a,
    horizonCool: 0x86aede,
    sun: 0xfff0cf,
    glow: 1.0,
    elev: 16.0,
    lightColor: 0xffe0b0,
    lightIntensity: 2.9,
    hemiSky: 0xb6d0f4,
    hemiGround: 0x7d7a6e,
    hemiIntensity: 2.4,
    groundColor: 0xf4f2f6,
    groundEmissive: 0x2a2434,
    groundEmissiveI: 0.1,
    exposure: 1.0,
    bloom: 0.44,
  },
];

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHorizonCool;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uGlow;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);

    // Dawn is directional. Warm light belongs in the sun's quarter of the
    // compass only — applying it the whole way round rings the scene in
    // magenta and reads as a gradient, not a sunrise.
    vec2 dAz = normalize(vec2(d.x, d.z) + 1e-5);
    vec2 sAz = normalize(vec2(uSunDir.x, uSunDir.z) + 1e-5);
    float toward = dot(dAz, sAz) * 0.5 + 0.5;
    vec3 horizon = mix(uHorizonCool, uHorizon, pow(toward, 1.9));

    // Vertical gradient, biased so the horizon band stays tight and low.
    float h = clamp(d.y, -1.0, 1.0);
    float grad = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.62);
    vec3 col = mix(horizon, uZenith, smoothstep(0.42, 0.86, grad));

    // Warm the sky below the horizon line into the ground haze.
    col = mix(col * 0.72, col, smoothstep(-0.22, 0.06, h));

    // Broad atmospheric bloom around the sun, plus a tighter core.
    float cosA = max(dot(d, normalize(uSunDir)), 0.0);
    float wide = pow(cosA, 7.0) * 0.34;
    float tight = pow(cosA, 110.0) * 0.85;
    col += uSunColor * (wide + tight) * uGlow;

    // Faint band of light hugging the horizon in the sun's direction.
    float band = exp(-abs(h) * 14.0) * pow(cosA, 2.0);
    col += uSunColor * band * 0.22 * uGlow;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSky(scene, renderer) {
  const uniforms = {
    uZenith: { value: new THREE.Color(KEYS[0].zenith) },
    uHorizon: { value: new THREE.Color(KEYS[0].horizon) },
    uHorizonCool: { value: new THREE.Color(KEYS[0].horizonCool) },
    uSunColor: { value: new THREE.Color(KEYS[0].sun) },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
    uGlow: { value: KEYS[0].glow },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 48, 32),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  // --- lights -------------------------------------------------------------

  const key = new THREE.DirectionalLight(KEYS[0].lightColor, KEYS[0].lightIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 140;
  const S = 42;
  key.shadow.camera.left = -S;
  key.shadow.camera.right = S;
  key.shadow.camera.top = S;
  key.shadow.camera.bottom = -S;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.045;
  key.shadow.radius = 2.5;
  scene.add(key);
  scene.add(key.target);

  const hemi = new THREE.HemisphereLight(KEYS[0].hemiSky, KEYS[0].hemiGround, KEYS[0].hemiIntensity);
  scene.add(hemi);

  // A weak cold fill from behind so the soldier never silhouettes to pure black.
  const fill = new THREE.DirectionalLight(0x9db3dd, 1.15);
  fill.position.set(-30, 24, 40);
  scene.add(fill);

  // --- sun disc + flare ---------------------------------------------------

  const sunGroup = new THREE.Group();
  sunGroup.frustumCulled = false;
  scene.add(sunGroup);

  // depthTest stays ON: with it off the glow draws straight through the snow
  // and the ranges, so a sun still below the skyline paints orange blobs on
  // the ground. renderOrder keeps it after opaque geometry but under the snow.
  const discMat = new THREE.SpriteMaterial({
    map: makeGlowSprite('rgba(255,250,235,1)', 'rgba(255,186,104,0.5)'),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const disc = new THREE.Sprite(discMat);
  disc.scale.setScalar(80);
  disc.renderOrder = 1;
  sunGroup.add(disc);

  const haloMat = new THREE.SpriteMaterial({
    map: makeGlowSprite('rgba(255,214,150,0.55)', 'rgba(255,150,70,0.22)'),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(300);
  halo.renderOrder = 0;
  sunGroup.add(halo);

  const flare = new Lensflare();
  const flareTex = makeGlowSprite('rgba(255,236,200,1)', 'rgba(255,170,90,0.4)');
  // Just the halo and one faint ghost. A full ghost train reads as orange
  // blobs scattered over the snow, which is not the mood we are after.
  flare.addElement(new LensflareElement(flareTex, 160, 0, new THREE.Color(0xffdca8)));
  flare.addElement(new LensflareElement(flareTex, 34, 0.62, new THREE.Color(0xffc98a)));
  sunGroup.add(flare);

  // --- fog ----------------------------------------------------------------

  scene.fog = new THREE.FogExp2(KEYS[0].horizon, 0.0125);

  // --- interpolation ------------------------------------------------------

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const sunDir = new THREE.Vector3();

  // The sun sits in this compass direction, ahead of and past the flagpole.
  const AZIMUTH = THREE.MathUtils.degToRad(-40);

  const state = {
    progress: 0,
    exposure: KEYS[0].exposure,
    bloom: KEYS[0].bloom,
    sunDir,
    sunWorld: new THREE.Vector3(),
    sunColor: uniforms.uSunColor.value,
    horizonColor: new THREE.Color(KEYS[0].horizon),
    lightIntensity: KEYS[0].lightIntensity,
    groundColor: new THREE.Color(KEYS[0].groundColor),
    groundEmissive: new THREE.Color(KEYS[0].groundEmissive),
    groundEmissiveI: KEYS[0].groundEmissiveI,
  };

  function segment(t) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (t <= KEYS[i + 1].t) {
        const a = KEYS[i];
        const b = KEYS[i + 1];
        const k = (t - a.t) / (b.t - a.t);
        return [a, b, k * k * (3 - 2 * k)];
      }
    }
    const last = KEYS[KEYS.length - 1];
    return [last, last, 0];
  }

  function lerpColor(target, a, b, k) {
    tmpA.set(a);
    tmpB.set(b);
    target.copy(tmpA).lerp(tmpB, k);
  }

  /** @param {number} t 0 = pre-dawn, 1 = risen. */
  function setProgress(t, boost = 0) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    state.progress = t;
    const [a, b, k] = segment(t);
    const mix = (pa, pb) => pa + (pb - pa) * k;

    lerpColor(uniforms.uZenith.value, a.zenith, b.zenith, k);
    lerpColor(uniforms.uHorizon.value, a.horizon, b.horizon, k);
    lerpColor(uniforms.uHorizonCool.value, a.horizonCool, b.horizonCool, k);
    lerpColor(uniforms.uSunColor.value, a.sun, b.sun, k);
    uniforms.uGlow.value = mix(a.glow, b.glow) * (1 + boost * 0.3);

    const elev = THREE.MathUtils.degToRad(mix(a.elev, b.elev));
    sunDir.set(Math.sin(AZIMUTH) * Math.cos(elev), Math.sin(elev), -Math.cos(AZIMUTH) * Math.cos(elev));
    uniforms.uSunDir.value.copy(sunDir);

    state.sunWorld.copy(sunDir).multiplyScalar(SUN_DISTANCE);
    sunGroup.position.copy(state.sunWorld);

    // The disc swells and brightens as it clears the ridge line.
    const above = THREE.MathUtils.clamp(elev / THREE.MathUtils.degToRad(8), 0, 1);
    discMat.opacity = 0.5 + above * 0.3 + boost * 0.12;
    haloMat.opacity = 0.15 + above * 0.16 + boost * 0.12;
    disc.scale.setScalar(62 + above * 26 + boost * 14);
    halo.scale.setScalar(230 + above * 90 + boost * 50);
    flare.visible = elev > -0.01;

    // Key light rides the sun.
    key.position.copy(sunDir).multiplyScalar(70);
    lerpColor(key.color, a.lightColor, b.lightColor, k);
    state.lightIntensity = mix(a.lightIntensity, b.lightIntensity) * (1 + boost * 0.16);
    key.intensity = state.lightIntensity;

    lerpColor(hemi.color, a.hemiSky, b.hemiSky, k);
    lerpColor(hemi.groundColor, a.hemiGround, b.hemiGround, k);
    hemi.intensity = mix(a.hemiIntensity, b.hemiIntensity) * (1 + boost * 0.08);

    lerpColor(state.groundColor, a.groundColor, b.groundColor, k);
    lerpColor(state.groundEmissive, a.groundEmissive, b.groundEmissive, k);
    state.groundEmissiveI = mix(a.groundEmissiveI, b.groundEmissiveI);

    // Fog and the distant ranges take a blend of the two horizons — the haze
    // is lit from the sun's side but wraps the whole valley.
    state.horizonColor.copy(uniforms.uHorizonCool.value).lerp(uniforms.uHorizon.value, 0.28);
    scene.fog.color.copy(state.horizonColor);

    state.exposure = mix(a.exposure, b.exposure) * (1 + boost * 0.03);
    state.bloom = mix(a.bloom, b.bloom) + boost * 0.3;

    renderer.toneMappingExposure = state.exposure;
  }

  setProgress(0);

  return {
    state,
    setProgress,
    keyLight: key,
    /** Keeps the dome and shadow frustum centred on the player. */
    follow(target) {
      dome.position.set(target.x, 0, target.z);
      key.target.position.copy(target);
      key.target.updateMatrixWorld();
      key.position.copy(sunDir).multiplyScalar(70).add(target);
    },
  };
}
