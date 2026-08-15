import * as THREE from 'three';
import { makePetalSprite, makeConfettiSprite } from '../core/textures.js';

/**
 * The flowers, and the confetti.
 *
 * These are bursts, not weather. The marigolds only exist because they were
 * folded inside the bundle and the knot let go — which is exactly what happens
 * at a real hoisting, and is the single most recognisable beat of the whole
 * ceremony. Nothing drifts around the scene the rest of the time.
 *
 * Motion is the closed-form solution for a particle under linear drag:
 *
 *     d   = (1 - e^(-k t)) / k
 *     pos = origin + v0 * d + vTerminal * (t - d)
 *
 * so a burst throws outward hard and then settles into a slow flutter with no
 * per-frame physics on the CPU at all — the entire effect is one draw call and
 * one uniform update.
 */

const COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uStart;
  uniform vec3 uOrigin;
  uniform float uProjScale;

  attribute vec3 aVel;
  attribute vec3 aSeed;   // x: launch delay / phase, y: size, z: fall rate
`;

function burstShader({ drag, terminal, flutter, sizeBase, life }) {
  return /* glsl */ `
  ${COMMON}
  varying float vAlpha;
  varying float vSpin;
  varying float vTint;

  const float K = ${drag.toFixed(2)};
  const float VT = ${terminal.toFixed(2)};

  void main() {
    float t = max(uTime - uStart - aSeed.x * 0.34, 0.0);
    float alive = step(0.0001, uStart) * step(0.0001, t);

    float d = (1.0 - exp(-K * t)) / K;
    vec3 pos = uOrigin + aVel * d + vec3(0.0, -VT * (0.7 + aSeed.z * 0.6), 0.0) * (t - d);

    float ph = aSeed.x * 6.2831;
    pos.x += sin(t * 2.1 + ph) * ${flutter.toFixed(2)} * min(t, 4.0);
    pos.z += cos(t * 1.7 + ph * 1.4) * ${(flutter * 0.9).toFixed(2)} * min(t, 4.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = -mv.z;
    gl_PointSize = (${sizeBase.toFixed(3)} + aSeed.y * ${sizeBase.toFixed(3)}) * uProjScale / max(dist, 1.0);

    vSpin = t * (2.4 + aSeed.z * 4.0) + ph;
    vTint = aSeed.y;

    float ground = smoothstep(0.55, 0.0, pos.y);
    vAlpha = alive * smoothstep(0.0, 0.07, t) * (1.0 - ground);
    vAlpha *= 1.0 - smoothstep(${(life - 3).toFixed(1)}, ${life.toFixed(1)}, t);
    vAlpha *= smoothstep(0.4, 2.2, dist) * (1.0 - smoothstep(48.0, 70.0, dist));
  }
`;
}

const PETAL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying float vSpin;
  varying float vTint;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;

    vec4 tex = texture2D(uMap, uv);
    float a = tex.a * vAlpha;
    if (a < 0.01) discard;

    // Marigold gold through to deep genda orange and the odd rose petal, so
    // the shower is not one flat colour.
    vec3 warm = mix(vec3(1.0, 0.72, 0.14), vec3(0.94, 0.36, 0.20), smoothstep(0.55, 1.0, vTint));
    vec3 col = tex.rgb * mix(vec3(1.0), warm, 0.65);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const CONFETTI_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying float vSpin;
  varying float vTint;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;

    vec4 tex = texture2D(uMap, uv);
    float a = tex.a * vAlpha;
    if (a < 0.01) discard;

    // Saffron, white, green — in that proportion, and never neon. Weighted
    // away from white, which blooms out to a snowstorm against a bright sky.
    vec3 col = vTint < 0.44 ? vec3(1.0, 0.58, 0.18)
             : vTint < 0.62 ? vec3(0.94, 0.93, 0.88)
             : vec3(0.09, 0.55, 0.14);
    // Foil catches the light as it tumbles.
    col *= 0.7 + 0.4 * abs(sin(vSpin * 1.7));
    gl_FragColor = vec4(col * tex.rgb, a);
    #include <colorspace_fragment>
  }
`;

function makeSystem(scene, { count, map, frag, vert, speed, up, spread }) {
  const vel = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed[0] + Math.random() * (speed[1] - speed[0]);
    vel[i * 3] = Math.cos(a) * s;
    vel[i * 3 + 1] = up[0] + Math.random() * (up[1] - up[0]);
    vel[i * 3 + 2] = Math.sin(a) * s * spread;
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uStart: { value: 0 },
    uOrigin: { value: new THREE.Vector3(0, 8, 0) },
    uProjScale: { value: 1400 },
    uMap: { value: map },
  };

  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.visible = false;
  scene.add(points);

  return { points, uniforms };
}

export function createPetals(scene) {
  const petals = makeSystem(scene, {
    count: 1100,
    map: makePetalSprite(),
    frag: PETAL_FRAG,
    vert: burstShader({ drag: 1.9, terminal: 0.82, flutter: 0.24, sizeBase: 0.085, life: 13 }),
    speed: [1.2, 4.4],
    up: [1.0, 4.4],
    spread: 0.85,
  });

  const confetti = makeSystem(scene, {
    count: 700,
    map: makeConfettiSprite(),
    frag: CONFETTI_FRAG,
    vert: burstShader({ drag: 1.4, terminal: 0.55, flutter: 0.4, sizeBase: 0.055, life: 15 }),
    speed: [2.2, 7.0],
    up: [2.4, 6.5],
    spread: 1.0,
  });

  return {
    /** Marigolds out of the bundle, at the moment the knot lets go. */
    burst(origin) {
      petals.uniforms.uOrigin.value.copy(origin);
      petals.uniforms.uStart.value = petals.uniforms.uTime.value;
      petals.points.visible = true;
    },

    /** The tricolour confetti, a beat later and from a little wider. */
    confetti(origin) {
      confetti.uniforms.uOrigin.value.copy(origin);
      confetti.uniforms.uStart.value = confetti.uniforms.uTime.value;
      confetti.points.visible = true;
    },

    /**
     * Takes the flowers back out of the air, for a second run at the pole.
     * Hiding the points is enough — each burst restamps its own start time,
     * so nothing carries over from the last one.
     */
    clear() {
      petals.points.visible = false;
      confetti.points.visible = false;
    },

    update(dt) {
      petals.uniforms.uTime.value += dt;
      confetti.uniforms.uTime.value += dt;
    },

    onResize(bufferHeight, fovDegrees) {
      const halfFov = THREE.MathUtils.degToRad(fovDegrees) / 2;
      const s = bufferHeight / (2 * Math.tan(halfFov));
      petals.uniforms.uProjScale.value = s;
      confetti.uniforms.uProjScale.value = s;
    },
  };
}
