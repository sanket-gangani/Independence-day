import * as THREE from 'three';
import { terrainHeight, POLE_POS } from './terrain.js';
import { makeFlagTexture } from '../core/textures.js';

/**
 * The flagpole and the tricolour.
 *
 * The cloth is a subdivided plane whose ripple is injected into a standard
 * material's vertex shader, so it still takes scene lighting and casts a
 * shadow. Normals are recomputed analytically from the wave derivatives —
 * without that the cloth ripples but shades like a flat board.
 */

const POLE_HEIGHT = 9.2;
const FLAG_W = 2.7;
const FLAG_H = 1.8;

// Where the hoisted flag's top edge sits, just under the finial.
const TOP_Y = POLE_HEIGHT - 0.42;
const BASE_Y = 1.55;

export function createFlag(scene) {
  const group = new THREE.Group();
  const groundY = terrainHeight(POLE_POS.x, POLE_POS.z);
  group.position.set(POLE_POS.x, groundY, POLE_POS.z);
  scene.add(group);

  // --- plinth -------------------------------------------------------------

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.45, 0.42, 24),
    new THREE.MeshStandardMaterial({ color: 0x8d8f98, roughness: 0.82, metalness: 0.08 })
  );
  plinth.position.y = 0.16;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // A ring of snow banked against the plinth.
  const bank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.95, 0.2, 24),
    new THREE.MeshStandardMaterial({ color: 0xeaf0fb, roughness: 0.93 })
  );
  bank.position.y = 0.06;
  bank.receiveShadow = true;
  group.add(bank);

  // --- pole ---------------------------------------------------------------

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.095, POLE_HEIGHT, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.32, metalness: 0.72 })
  );
  pole.position.y = POLE_HEIGHT / 2 + 0.35;
  pole.castShadow = true;
  group.add(pole);

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 20, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffc866,
      roughness: 0.22,
      metalness: 0.95,
      emissive: new THREE.Color(0x000000),
    })
  );
  finial.position.y = POLE_HEIGHT + 0.44;
  finial.castShadow = true;
  group.add(finial);

  // --- halyard ------------------------------------------------------------

  const ropeMat = new THREE.LineBasicMaterial({ color: 0xb9bfcb, transparent: true, opacity: 0.65 });
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.1, POLE_HEIGHT + 0.3, 0),
    new THREE.Vector3(0.13, 1.2, 0),
  ]);
  const rope = new THREE.Line(ropeGeo, ropeMat);
  group.add(rope);
  const ropePts = ropeGeo.attributes.position;

  // --- cloth --------------------------------------------------------------

  const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 48, 28);
  // Shift so the hoist edge sits on the pole and x runs outward from it.
  geo.translate(FLAG_W / 2, 0, 0);

  const flagTex = makeFlagTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: flagTex,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.0,
    // The flag flies with the sunrise behind it, so the face we watch is in
    // shadow all the way through the climax. A little self-illumination keeps
    // the tricolour reading as the tricolour instead of going to mud.
    emissiveMap: flagTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.34,
  });

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.0 },
    uWind: { value: 1.0 },
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.uniforms.uWind = uniforms.uWind;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uAmp;
        uniform float uWind;

        // Displacement along the cloth normal, and its partial derivatives,
        // so we can rebuild the normal instead of shading a flat plane.
        void clothWave(vec2 uvw, out float disp, out float ddu, out float ddv) {
          // Anchored at the hoist edge, free at the fly end.
          float ramp = pow(uvw.x, 1.25);
          float dramp = 1.25 * pow(max(uvw.x, 0.0001), 0.25);

          float t = uTime * uWind;

          float a1 = uvw.x * 7.0 - t * 3.1;
          float a2 = uvw.x * 4.0 + uvw.y * 5.0 - t * 2.2;
          float a3 = uvw.y * 3.0 - t * 1.4;

          float s1 = sin(a1) * 0.20;
          float s2 = sin(a2) * 0.115;
          float s3 = sin(a3) * 0.055;

          float base = s1 + s2 + s3;
          disp = base * ramp * uAmp;

          float dbase_du = (cos(a1) * 0.20 * 7.0) + (cos(a2) * 0.115 * 4.0);
          float dbase_dv = (cos(a2) * 0.115 * 5.0) + (cos(a3) * 0.055 * 3.0);

          ddu = (dbase_du * ramp + base * dramp) * uAmp;
          ddv = dbase_dv * ramp * uAmp;
        }
      `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        {
          float d, ddu, ddv;
          clothWave(uv, d, ddu, ddv);
          // uv.x spans FLAG_W, uv.y spans FLAG_H in object units.
          objectNormal = normalize(vec3(-ddu / ${FLAG_W.toFixed(2)}, -ddv / ${FLAG_H.toFixed(
          2
        )}, 1.0));
        }
      `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          float d, ddu, ddv;
          clothWave(uv, d, ddu, ddv);
          transformed.z += d;
          // The fly end sags and is tugged back toward the pole as it billows.
          transformed.y -= pow(uv.x, 1.6) * 0.10 * uAmp;
          transformed.x -= pow(uv.x, 2.0) * 0.07 * uAmp;
        }
      `
      );
  };
  // Force a distinct program so the patched shader is not shared elsewhere.
  mat.customProgramCacheKey = () => 'tricolour-cloth';

  const cloth = new THREE.Mesh(geo, mat);
  cloth.castShadow = true;
  cloth.position.set(0.09, 0, 0);

  const flagPivot = new THREE.Group();
  flagPivot.add(cloth);
  group.add(flagPivot);

  // --- state --------------------------------------------------------------

  // Furled at the foot of the pole: rolled tight and hanging still.
  let hoist = 0; // 0 = furled at base, 1 = flying at the top
  applyHoist(0);

  function applyHoist(h) {
    hoist = h;
    const y = BASE_Y + (TOP_Y - BASE_Y) * h;
    flagPivot.position.y = y;

    // Unfurl over the first third of the climb.
    const open = THREE.MathUtils.smoothstep(h, 0.0, 0.34);
    cloth.scale.set(0.22 + 0.78 * open, 0.16 + 0.84 * open, 1);
    // Ripple only once there is cloth to catch the wind.
    uniforms.uAmp.value = open * open;
    // A furled flag hugs the pole.
    cloth.position.z = (1 - open) * 0.06;

    // Halyard follows the flag down.
    ropePts.setY(1, y - 0.2);
    ropePts.needsUpdate = true;
  }

  return {
    group,
    cloth,
    poleTopY: groundY + TOP_Y,
    position: group.position,

    get hoist() {
      return hoist;
    },

    setHoist: applyHoist,

    update(dt, windStrength = 1) {
      uniforms.uTime.value += dt;
      uniforms.uWind.value = windStrength;
    },

    /** The gold finial catches the sun first. */
    sync(skyState) {
      finial.material.emissive.copy(skyState.sunColor).multiplyScalar(0.35 * skyState.progress);
    },
  };
}
