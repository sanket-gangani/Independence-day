import * as THREE from 'three';
import { makeGlowSprite } from '../core/textures.js';

/**
 * Half past seven on a August morning in India.
 *
 * This is the light the whole scene is graded around, so it is pinned tightly:
 * the sun never rises above twenty-six degrees, which is what keeps the shadows
 * long and raking across the paving, and the colour never leaves the range
 * between first warm light and clean morning gold. No purple, no magenta, no
 * fantasy sunset — that reads as a game. A real Indian morning is a soft warm
 * haze at the horizon, a washed pale blue overhead, thin high cloud, and low
 * sun cutting between the buildings.
 *
 * One number drives everything: `progress`, 0 at the moment you walk in and 1
 * once the flag is up and the sun has climbed a little further.
 */

const SUN_DISTANCE = 900;

// Elevation stays inside 15–26 degrees. Below that the sun stops reaching a
// horizontal surface at all and the courtyard goes flat and blue no matter
// how warm the light colour is; above it the shadows shorten and it starts
// looking like noon. This window is the one that reads as morning.
const KEYS = [
  {
    t: 0.0,
    zenith: 0x6d9ac6,
    horizon: 0xf7d7a2,
    haze: 0xffcf93,
    sun: 0xffd08a,
    glow: 0.8,
    elev: 15.5,
    lightColor: 0xffc586,
    lightIntensity: 2.35,
    hemiSky: 0xbdd0de,
    hemiGround: 0xbb9a70,
    hemiIntensity: 0.62,
    groundTint: 0xf4dcb4,
    fog: 0.0030,
    exposure: 0.96,
    bloom: 0.22,
  },
  {
    t: 0.5,
    zenith: 0x5d92cb,
    horizon: 0xfae0b6,
    haze: 0xffdcae,
    sun: 0xffe0ab,
    glow: 0.9,
    elev: 20,
    lightColor: 0xffd7a0,
    lightIntensity: 2.6,
    hemiSky: 0xc4d8e8,
    hemiGround: 0xc4a67c,
    hemiIntensity: 0.7,
    groundTint: 0xf8e6c4,
    fog: 0.0024,
    exposure: 0.99,
    bloom: 0.26,
  },
  {
    t: 1.0,
    zenith: 0x4f8cd0,
    horizon: 0xfdedcd,
    haze: 0xffe8c6,
    sun: 0xffedc6,
    glow: 1.0,
    elev: 25.5,
    lightColor: 0xffe6bd,
    lightIntensity: 2.9,
    hemiSky: 0xcadcee,
    hemiGround: 0xd0b48a,
    hemiIntensity: 0.8,
    groundTint: 0xfcefd6,
    fog: 0.0018,
    exposure: 1.02,
    bloom: 0.32,
  },
];

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uGlow;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);

    // Base gradient, weighted so most of the visible sky is the warm band
    // near the horizon rather than the blue overhead.
    float grad = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.62);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.48, 0.92, grad));

    // Morning haze: a thick warm layer hugging the horizon that the buildings
    // and trees fade into. This is the single most "seven in the morning"
    // thing in the whole shader.
    float hazeBand = exp(-max(h, 0.0) * 9.0);
    col = mix(col, uHaze, hazeBand * 0.52);

    // The sun warms the whole quarter of the sky around it, not just its disc.
    vec3 sd = normalize(uSunDir);
    float cosA = max(dot(d, sd), 0.0);
    col += uSunColor * (pow(cosA, 3.0) * 0.14 + pow(cosA, 24.0) * 0.34 + pow(cosA, 220.0) * 0.9) * uGlow;

    // Thin high cloud, drifting. Only above the haze, and only ever a wash —
    // heavy cloud would kill the low sun the rest of the scene depends on.
    if (h > 0.02) {
      vec2 uv = d.xz / max(h + 0.16, 0.001);
      float c = fbm(uv * 1.1 + vec2(uTime * 0.004, uTime * 0.002));
      c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.34, h);
      float lit = 0.55 + 0.45 * pow(cosA, 2.0);
      col = mix(col, mix(vec3(0.99, 0.96, 0.92), uSunColor, 0.35) * lit, c * 0.5);
      // A second, higher, wispier layer.
      float c2 = fbm(uv * 3.1 - vec2(uTime * 0.006, 0.0));
      c2 = smoothstep(0.62, 0.9, c2) * smoothstep(0.05, 0.4, h);
      col = mix(col, vec3(1.0, 0.98, 0.95) * lit, c2 * 0.22);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSky(scene, renderer, quality = null) {
  const uniforms = {
    uZenith: { value: new THREE.Color(KEYS[0].zenith) },
    uHorizon: { value: new THREE.Color(KEYS[0].horizon) },
    uHaze: { value: new THREE.Color(KEYS[0].haze) },
    uSunColor: { value: new THREE.Color(KEYS[0].sun) },
    uSunDir: { value: new THREE.Vector3(0.7, 0.15, 0.6) },
    uGlow: { value: KEYS[0].glow },
    uTime: { value: 0 },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 48, 32),
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

  /* --- lights ------------------------------------------------------------ */

  const key = new THREE.DirectionalLight(KEYS[0].lightColor, KEYS[0].lightIntensity);
  key.castShadow = true;
  const shadowRes = quality?.shadowMap ?? 2048;
  key.shadow.mapSize.set(shadowRes, shadowRes);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 140;
  const S = 30;
  key.shadow.camera.left = -S;
  key.shadow.camera.right = S;
  key.shadow.camera.top = S;
  key.shadow.camera.bottom = -S;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 2.2;
  scene.add(key);
  scene.add(key.target);

  const hemi = new THREE.HemisphereLight(KEYS[0].hemiSky, KEYS[0].hemiGround, KEYS[0].hemiIntensity);
  scene.add(hemi);

  // Warm bounce back off the paving, from low and in front, so faces on the
  // shadow side of the crowd are readable rather than silhouettes.
  const bounce = new THREE.DirectionalLight(0xffc78e, 0.34);
  bounce.position.set(-12, 3, 15);
  scene.add(bounce);

  // A weak cool fill from the open sky opposite the sun, so shadows go blue
  // rather than black — which is what shadows actually look like in the
  // morning. Kept deliberately low: crank this and the whole courtyard turns
  // grey and the warmth of the hour disappears.
  const fill = new THREE.DirectionalLight(0x9dbde0, 0.16);
  fill.position.set(-22, 14, -16);
  scene.add(fill);

  /* --- the sun ------------------------------------------------------------ */

  const sunGroup = new THREE.Group();
  sunGroup.frustumCulled = false;
  scene.add(sunGroup);

  const discMat = new THREE.SpriteMaterial({
    map: makeGlowSprite('rgba(255,250,232,1)', 'rgba(255,196,116,0.5)'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const disc = new THREE.Sprite(discMat);
  disc.scale.setScalar(80);
  disc.renderOrder = 1;
  sunGroup.add(disc);

  scene.fog = new THREE.FogExp2(KEYS[0].haze, KEYS[0].fog);

  /* --- interpolation ------------------------------------------------------ */

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const sunDir = new THREE.Vector3();
  // East-south-east, off to the player's right as they face the pole, so the
  // light rakes across the courtyard rather than flattening it.
  const AZIMUTH = THREE.MathUtils.degToRad(72);

  const state = {
    progress: 0,
    exposure: KEYS[0].exposure,
    bloom: KEYS[0].bloom,
    sunDir,
    sunColor: uniforms.uSunColor.value,
    horizonColor: new THREE.Color(KEYS[0].horizon),
    groundTint: new THREE.Color(KEYS[0].groundTint),
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

  /** @param t 0 = the moment you walk in, 1 = the flag is up. */
  function setProgress(t, boost = 0) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    state.progress = t;
    const [a, b, k] = segment(t);
    const mix = (pa, pb) => pa + (pb - pa) * k;

    lerpColor(uniforms.uZenith.value, a.zenith, b.zenith, k);
    lerpColor(uniforms.uHorizon.value, a.horizon, b.horizon, k);
    lerpColor(uniforms.uHaze.value, a.haze, b.haze, k);
    lerpColor(uniforms.uSunColor.value, a.sun, b.sun, k);
    uniforms.uGlow.value = mix(a.glow, b.glow) * (1 + boost * 0.25);

    const elev = THREE.MathUtils.degToRad(mix(a.elev, b.elev));
    sunDir.set(Math.sin(AZIMUTH) * Math.cos(elev), Math.sin(elev), Math.cos(AZIMUTH) * Math.cos(elev));
    uniforms.uSunDir.value.copy(sunDir);
    sunGroup.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);

    discMat.opacity = 0.55 + t * 0.28 + boost * 0.15;
    disc.scale.setScalar(74 + t * 20 + boost * 14);

    // Pushed well out so the shadow volume covers the whole courtyard.
    key.position.copy(sunDir).multiplyScalar(62);
    lerpColor(key.color, a.lightColor, b.lightColor, k);
    key.intensity = mix(a.lightIntensity, b.lightIntensity) * (1 + boost * 0.12);

    lerpColor(hemi.color, a.hemiSky, b.hemiSky, k);
    lerpColor(hemi.groundColor, a.hemiGround, b.hemiGround, k);
    hemi.intensity = mix(a.hemiIntensity, b.hemiIntensity);

    lerpColor(state.groundTint, a.groundTint, b.groundTint, k);
    state.horizonColor.copy(uniforms.uHorizon.value);
    scene.fog.color.copy(uniforms.uHaze.value);
    scene.fog.density = mix(a.fog, b.fog);

    state.exposure = mix(a.exposure, b.exposure) * (1 + boost * 0.04);
    state.bloom = mix(a.bloom, b.bloom) + boost * 0.26;
    renderer.toneMappingExposure = state.exposure;
  }

  setProgress(0);

  return {
    state,
    setProgress,
    keyLight: key,
    update(dt) {
      uniforms.uTime.value += dt;
    },
  };
}
