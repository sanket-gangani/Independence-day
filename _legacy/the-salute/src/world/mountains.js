import * as THREE from 'three';

/**
 * The Himalayan ring.
 *
 * This used to be a 1D ridgeline — one height per compass angle, extruded
 * straight down. That is a painted curtain: no spurs, no side valleys, no
 * depth, and every face shades identically. It read as generic because it was.
 *
 * Now it is real displaced terrain: an annulus around the valley, pushed up by
 * 2D ridged fBm, with true vertex normals. That gives arêtes that fork and die
 * away, cirques between them, faces that catch the dawn at different angles,
 * and a silhouette that changes as you walk.
 *
 * Shading is slope-aware — snow settles on the shallows and the summits while
 * steep faces stay bare rock, which is what actually makes a mountain read as
 * a mountain rather than a white cone.
 */

const INNER_R = 330; // clear of the ground plane and its fog falloff
const OUTER_R = 1150;
const SEG_A = 320; // around
const SEG_R = 90; // outward

// ---------------------------------------------------------------- noise

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothT(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothT(x - xi);
  const yf = smoothT(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

/**
 * Ridged multifractal. Folding each octave at zero and inverting turns rounded
 * hills into sharp crests; weighting each octave by the previous one keeps the
 * detail on the ridges and off the valley floors, which is what stops the
 * result looking like uniformly crumpled paper.
 */
function ridgedFbm(x, y, octaves = 6) {
  let sum = 0;
  let freq = 1;
  let amp = 0.5;
  let weight = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    let n = valueNoise(x * freq, y * freq) * 2 - 1;
    n = 1 - Math.abs(n);
    n *= n;
    n *= weight;
    // Steer the next octave toward the crest of this one.
    weight = Math.min(1, n * 2.2);
    sum += n * amp;
    norm += amp;
    freq *= 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- geometry

function buildRange() {
  const geo = new THREE.BufferGeometry();

  const vertCount = (SEG_A + 1) * (SEG_R + 1);
  const positions = new Float32Array(vertCount * 3);
  const heights = new Float32Array(vertCount); // normalised altitude
  const dists = new Float32Array(vertCount); // 0..1 across the ring, for haze

  let p = 0;
  for (let ri = 0; ri <= SEG_R; ri++) {
    // Bias samples toward the inner edge — that is the silhouette you actually
    // read, so it deserves the resolution.
    const rt = ri / SEG_R;
    const r = INNER_R + (OUTER_R - INNER_R) * rt * rt;

    for (let ai = 0; ai <= SEG_A; ai++) {
      const a = (ai / SEG_A) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // Rise out of the valley floor rather than walling it off abruptly.
      const foot = THREE.MathUtils.smoothstep(r, INNER_R, INNER_R + 260);

      // Two fields at different scales: broad massifs, then the ridges and
      // gullies carved into them.
      const massif = ridgedFbm(x * 0.0016, z * 0.0016, 4);
      const detail = ridgedFbm(x * 0.0052 + 41.3, z * 0.0052 - 17.9, 5);
      const shaped = massif * 0.74 + detail * 0.26 * (0.35 + massif * 0.9);

      // Height scales with distance so the range holds a roughly constant
      // angular size. A fixed height makes the near ring loom like a wall and
      // the far ring vanish.
      const scaleByDist = r * 0.30;
      const h = Math.pow(shaped, 1.15) * scaleByDist * foot;

      const i3 = p * 3;
      positions[i3] = x;
      positions[i3 + 1] = h - 26; // sink the feet below the fog line
      positions[i3 + 2] = z;
      heights[p] = shaped;
      dists[p] = rt;
      p++;
    }
  }

  const indices = [];
  const row = SEG_A + 1;
  for (let ri = 0; ri < SEG_R; ri++) {
    for (let ai = 0; ai < SEG_A; ai++) {
      const a0 = ri * row + ai;
      const a1 = a0 + 1;
      const b0 = a0 + row;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
  geo.setAttribute('aDist', new THREE.BufferAttribute(dists, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------- shading

const VERT = /* glsl */ `
  attribute float aHeight;
  attribute float aDist;
  varying float vHeight;
  varying float vDist;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    vHeight = aHeight;
    vDist = aDist;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uRock;
  uniform vec3 uRockLit;
  uniform vec3 uSnow;
  uniform vec3 uHaze;
  uniform vec3 uSkyLight;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uGlow;
  uniform float uProgress;

  varying float vHeight;
  varying float vDist;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 n = normalize(vNormalW);

    // Slope, 0 flat .. 1 vertical. This is the key to a mountain reading as
    // rock and not as a white cone: snow cannot hold on a steep face.
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);

    // The snow line wanders — a level one looks like a contour map.
    float wobble = noise(vWorld.xz * 0.004) * 0.16 + noise(vWorld.xz * 0.017) * 0.06;
    float altitude = vHeight + wobble - 0.08;

    float snowMask = smoothstep(0.04, 0.22, altitude) * (1.0 - smoothstep(0.46, 0.86, slope));
    // Summits keep their caps whatever the slope.
    snowMask = max(snowMask, smoothstep(0.26, 0.46, altitude) * (1.0 - smoothstep(0.74, 0.97, slope)));

    // Tonal variation so big rock faces are not flat colour.
    float grain = noise(vWorld.xz * 0.03) * 0.5 + noise(vWorld.xz * 0.11) * 0.25;
    vec3 albedo = mix(mix(uRock, uRockLit, grain), uSnow, snowMask);

    // --- light -------------------------------------------------------------
    vec3 sun = normalize(uSunDir);
    float lambert = max(dot(n, sun), 0.0);

    // Snow scatters light forward; rock does not. Wrapping the term for snow
    // keeps the shadowed side from going dead flat.
    float wrapped = max((dot(n, sun) + 0.35) / 1.35, 0.0);
    float diffuse = mix(lambert, wrapped, snowMask * 0.7);

    float skyAmount = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 lit = albedo * (uSkyLight * (0.35 + skyAmount * 0.85) + uSunColor * diffuse * uGlow);

    // Alpenglow: the low sun rakes the high snow and turns it rose-gold. It
    // lands hardest on faces square to the sun, and mostly on snow.
    float glowFace = pow(lambert, 1.6);
    lit += uSunColor * glowFace * uGlow * (0.06 + snowMask * 0.5) * smoothstep(0.15, 0.6, altitude);

    // A cool rim on the shaded flanks keeps them off pure black.
    lit += uSkyLight * pow(1.0 - lambert, 3.0) * 0.12;

    // --- atmosphere --------------------------------------------------------
    // Aerial perspective: further ranges wash out, and low ground washes out
    // faster than summits because the haze pools in the valleys.
    float haze = mix(0.30, 0.90, vDist);
    haze = mix(haze, haze * 0.55, smoothstep(0.25, 0.75, vHeight));
    haze = clamp(haze - uProgress * 0.10, 0.0, 0.95);

    gl_FragColor = vec4(mix(lit, uHaze, haze), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createMountains(scene) {
  const group = new THREE.Group();
  group.name = 'mountains';

  const uniforms = {
    uRock: { value: new THREE.Color(0x6d7489) },
    uRockLit: { value: new THREE.Color(0x9aa1b6) },
    uSnow: { value: new THREE.Color(0xf0f5ff) },
    uHaze: { value: new THREE.Color(0x3b3560) },
    uSkyLight: { value: new THREE.Color(0x8fa6cd) },
    uSunColor: { value: new THREE.Color(0xffb877) },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
    uGlow: { value: 0.3 },
    uProgress: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(buildRange(), mat);
  mesh.renderOrder = -500;
  mesh.frustumCulled = false;
  group.add(mesh);
  scene.add(group);

  return {
    group,
    mesh,

    /** Driven each frame from the sky state. */
    sync(skyState) {
      uniforms.uHaze.value.copy(skyState.horizonColor);
      uniforms.uSunColor.value.copy(skyState.sunColor);
      uniforms.uSunDir.value.copy(skyState.sunDir);
      uniforms.uSkyLight.value.copy(skyState.groundColor).multiplyScalar(0.9);
      uniforms.uGlow.value = 0.25 + skyState.progress * 1.15;
      uniforms.uProgress.value = skyState.progress;
    },

    /** Keep the range ringed around the player. */
    follow(target) {
      group.position.set(target.x, 0, target.z);
    },
  };
}
