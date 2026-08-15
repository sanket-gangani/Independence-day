import * as THREE from 'three';
import { terrainHeight, terrainNormal } from './terrain.js';
import { makeFootprintTexture } from '../core/textures.js';

/**
 * Boot prints pressed into the snow behind the player.
 *
 * A ring buffer of instances on one InstancedMesh. Each print carries a
 * spawn time in an instanced attribute and the fragment shader fades it as
 * fresh snow fills it back in — so the trail is finite without any per-print
 * material work on the CPU.
 */

const MAX = 90;
const STRIDE = 0.72; // metres between prints
const LIFETIME = 26.0; // seconds before a print is fully filled in

export function createFootprints(scene) {
  const geo = new THREE.PlaneGeometry(0.42, 0.62);
  geo.rotateX(-Math.PI / 2);

  // A plain BufferGeometry with one instanced attribute alongside; InstancedMesh
  // supplies instanceMatrix and the draw count.
  const birth = new Float32Array(MAX).fill(-1e9);
  const birthAttr = new THREE.InstancedBufferAttribute(birth, 1);
  birthAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBirth', birthAttr);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: makeFootprintTexture() },
      uTime: { value: 0 },
      uLifetime: { value: LIFETIME },
      uColor: { value: new THREE.Color(0x5c6f96) },
      uStrength: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      attribute float aBirth;
      uniform float uTime;
      uniform float uLifetime;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vUv = uv;
        float age = uTime - aBirth;
        vFade = (age < 0.0 || age > uLifetime)
          ? 0.0
          // Press in quickly, then fill back in slowly.
          : smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.35, 1.0, age / uLifetime));
        vec4 world = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        float a = texture2D(uMap, vUv).a * vFade * uStrength;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Park every instance out of sight until it is used.
  const dummy = new THREE.Object3D();
  dummy.position.set(0, -1000, 0);
  dummy.updateMatrix();
  for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;

  scene.add(mesh);

  let cursor = 0;
  let footSide = 1;
  let time = 0;
  const last = new THREE.Vector3();
  let armed = false;

  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();

  return {
    mesh,

    reset(position) {
      last.copy(position);
      armed = true;
    },

    update(dt, position, heading, moving) {
      time += dt;
      mat.uniforms.uTime.value = time;

      if (!moving) return;
      if (!armed) {
        this.reset(position);
        return;
      }
      if (position.distanceTo(last) < STRIDE) return;
      last.copy(position);

      // Offset left/right of the direction of travel so the trail reads as
      // two feet rather than one dragged line.
      const ox = Math.cos(heading) * 0.16 * footSide;
      const oz = -Math.sin(heading) * 0.16 * footSide;
      footSide *= -1;

      const x = position.x + ox;
      const z = position.z + oz;

      dummy.position.set(x, terrainHeight(x, z) + 0.015, z);
      // Lay the print flat on the slope, then spin it to face the walk.
      terrainNormal(x, z, normal);
      quat.setFromUnitVectors(up, normal);
      tilt.setFromAxisAngle(up, heading);
      dummy.quaternion.copy(quat).multiply(tilt);
      dummy.scale.setScalar(0.95 + Math.random() * 0.12);
      dummy.updateMatrix();

      mesh.setMatrixAt(cursor, dummy.matrix);
      birth[cursor] = time;
      birthAttr.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;

      cursor = (cursor + 1) % MAX;
    },

    /** Prints read as blue shadow at dawn and soften as the light warms. */
    sync(skyState) {
      mat.uniforms.uStrength.value = 0.34 + skyState.progress * 0.3;
      mat.uniforms.uColor.value.setHSL(0.6, 0.3 - skyState.progress * 0.14, 0.34 + skyState.progress * 0.1);
    },
  };
}
