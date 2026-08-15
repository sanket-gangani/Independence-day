import * as THREE from 'three';
import { makeSnowSprite } from '../core/textures.js';

/**
 * GPU snowfall. Every flake's motion is a closed-form function of time in the
 * vertex shader, so the CPU only ever touches two uniforms per frame.
 *
 * Flakes live in absolute world space and are wrapped into a box centred on
 * the player. That keeps proper parallax as you walk — a flake only ever
 * teleports when it crosses the far boundary, which is behind you and fogged.
 */

const COUNT = 9500;
const BOX_W = 120; // horizontal wrap period
const BOX_H = 42; // vertical wrap period

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform float uSize;
  uniform float uProjScale;
  uniform float uWind;

  attribute vec3 aSeed;   // x: phase, y: fall speed, z: size scale
  varying float vAlpha;

  const float W = ${BOX_W.toFixed(1)};
  const float H = ${BOX_H.toFixed(1)};

  // Wrap v into [c - period/2, c + period/2).
  float wrapAround(float v, float c, float period) {
    return mod(v - c + period * 0.5, period) - period * 0.5 + c;
  }

  void main() {
    vec3 p = position;
    float ph = aSeed.x * 6.2831;

    // Absolute descent, wrapped into [0, H] above the snow line.
    float fall = uTime * (1.0 + aSeed.y * 1.7);
    float y = mod(p.y - fall, H);

    // Diagonal drift plus a slow lateral sway, unique per flake.
    float x = p.x + sin(uTime * 0.42 + ph) * (0.7 + aSeed.z * 1.5) + uWind * uTime;
    float z = p.z + cos(uTime * 0.31 + ph * 1.7) * (0.5 + aSeed.z * 1.2);

    // Wrap horizontally around the player, in world space.
    x = wrapAround(x, uCenter.x, W);
    z = wrapAround(z, uCenter.z, W);

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = -mv.z;
    // Blend a constant angular size with true 1/d attenuation. Pure 1/d is
    // physically right but puts distant flakes below a pixel, and the snowfall
    // reads as a dozen stray dots instead of weather.
    //
    // uProjScale carries viewport height AND field of view, so a flake covers
    // the same fraction of the view on a wide desktop lens and a narrow
    // portrait one. Scale by raw pixel ratio instead and phone screens get a
    // blizzard.
    gl_PointSize = uSize * (0.55 + aSeed.z) * uProjScale * (0.0029 + 0.0145 / max(dist, 1.2));

    // Dissolve at the far edge of the volume and right at the near plane so
    // nothing pops or smears across the lens.
    vAlpha = smoothstep(0.4, 3.5, dist) * (1.0 - smoothstep(34.0, 58.0, dist));

    // And melt into the snow over the last couple of metres.
    vAlpha *= smoothstep(0.0, 2.5, y);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export function createSnow(scene) {
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * BOX_W;
    positions[i * 3 + 1] = Math.random() * BOX_H;
    positions[i * 3 + 2] = (Math.random() - 0.5) * BOX_W;
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uSize: { value: 1.25 },
    uProjScale: { value: 1800 },
    uWind: { value: 0.35 },
    uMap: { value: makeSnowSprite() },
    uColor: { value: new THREE.Color(0xeef4ff) },
    uOpacity: { value: 0.72 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  return {
    points,
    update(dt, center) {
      uniforms.uTime.value += dt;
      uniforms.uCenter.value.copy(center);
    },
    /**
     * @param bufferHeight drawing buffer height in device pixels
     * @param fovDegrees   camera vertical field of view
     */
    onResize(bufferHeight, fovDegrees) {
      const halfFov = THREE.MathUtils.degToRad(fovDegrees) / 2;
      uniforms.uProjScale.value = bufferHeight / (2 * Math.tan(halfFov));
    },
    /** Flakes pick up the colour of the sky as it warms. */
    setTint(color) {
      uniforms.uColor.value.copy(color);
    },
  };
}
