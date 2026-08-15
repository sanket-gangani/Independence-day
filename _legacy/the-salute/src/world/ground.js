import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { makeSnowNormalMap } from '../core/textures.js';

const SIZE = 320;
const SEGMENTS = 300;

export function createGround(scene) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xdfe7f5,
    roughness: 0.92,
    metalness: 0.0,
    normalMap: makeSnowNormalMap(),
    normalScale: new THREE.Vector2(0.4, 0.4),
    // Snow is not a diffuse-only surface: a touch of translucent lift keeps it
    // from going flat grey in the pre-dawn light.
    emissive: new THREE.Color(0x0a1430),
    emissiveIntensity: 0.35,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  scene.add(mesh);

  return {
    mesh,
    material: mat,
    /** Nudged by the sunrise so the snow warms up with the sky. */
    setTint(color, emissive, emissiveIntensity) {
      mat.color.copy(color);
      mat.emissive.copy(emissive);
      mat.emissiveIntensity = emissiveIntensity;
    },
  };
}
