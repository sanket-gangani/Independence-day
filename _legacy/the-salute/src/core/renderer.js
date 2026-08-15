import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Renderer plus the post chain: bloom for the sunrise, then tone mapping and
 * colour space, then a combined vignette / warm-grade / grain pass.
 *
 * Order matters. The grade runs *after* OutputPass, on tone-mapped LDR values.
 * Run it before, on the HDR buffer, and its contrast curve is evaluated at
 * c > 1 where the smoothstep polynomial turns negative — the brightest channel
 * clamps to zero and the sun picks up a cyan core.
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.52 },
    uWarmth: { value: 0.0 },
    uGrain: { value: 0.03 },
    uTime: { value: 0 },
    uFade: { value: 0.0 }, // 1 = fully black, used for the opening fade-in
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uWarmth;
    uniform float uGrain;
    uniform float uTime;
    uniform float uFade;
    varying vec2 vUv;

    void main() {
      // Already tone-mapped and in sRGB, but clamp anyway: the contrast curve
      // below is only well behaved on [0,1].
      vec4 c = clamp(texture2D(tDiffuse, vUv), 0.0, 1.0);

      // Warm grade: lift the highlights toward gold, cool the shadows a touch.
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 warm = c.rgb * vec3(1.06, 1.005, 0.94);
      vec3 cool = c.rgb * vec3(0.95, 0.985, 1.07);
      c.rgb = mix(cool, warm, smoothstep(0.18, 0.72, luma));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.1, 1.02, 0.88), uWarmth);

      // Very gentle S-curve. Heavier than this and the pre-dawn scene loses
      // its shadow detail entirely under ACES.
      c.rgb = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb) * 0.18 + c.rgb * 0.82;

      // Vignette.
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * uVignette;
      c.rgb *= clamp(v, 0.0, 1.0);

      // Fine grain so the gradients in the sky do not band.
      float n = fract(sin(dot(vUv * (1.0 + uTime * 0.001), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * uGrain;

      c.rgb *= (1.0 - uFade);
      gl_FragColor = vec4(c.rgb, 1.0);
    }
  `,
};

/**
 * Device pixel ratio, deliberately capped well below the display's own.
 *
 * On a Retina laptop the honest ratio of 2 means a ~3000x1700 drawing buffer,
 * and this post chain then wants two full HDR composer targets, the bloom mip
 * chain, and two more LDR targets on top — comfortably past 150 MB of render
 * targets on a GPU sharing system memory. That pressure is what produces
 * stale, hard-edged blocks where the compositor failed to repaint a tile.
 *
 * 1.5 costs ~44% fewer pixels and, under bloom and film grain, is very hard to
 * tell apart from 2.
 */
function pixelRatioFor(viewportWidth) {
  const cap = viewportWidth > 1600 ? 1.25 : 1.5;
  return Math.min(window.devicePixelRatio || 1, cap);
}

export function createRenderer(canvas, scene, camera) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });

  renderer.setPixelRatio(pixelRatioFor(window.innerWidth));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is deprecated and silently falls back to PCF anyway;
  // ask for PCF directly and soften it with the per-light shadow radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35, // strength, driven by the sunrise
    0.85, // radius
    0.85 // threshold — sunlit snow is bright enough to bloom the whole frame
  );
  composer.addPass(bloom);

  // Tone map and convert to sRGB first, so the grade below works on LDR.
  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  // Framing is composed for landscape. On a narrow portrait viewport a fixed
  // vertical FOV crops the horizontal view to almost nothing and the soldier
  // fills the screen, so widen vertically to hold the horizontal field.
  const BASE_FOV = 50;
  const BASE_ASPECT = 16 / 9;
  const MAX_FOV = 78;

  function fovFor(aspect) {
    if (aspect >= BASE_ASPECT) return BASE_FOV;
    const halfV = THREE.MathUtils.degToRad(BASE_FOV) / 2;
    const halfH = Math.atan(Math.tan(halfV) * BASE_ASPECT);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect));
    return Math.min(fov, MAX_FOV);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = pixelRatioFor(w);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    composer.setPixelRatio(dpr);
    // composer.setSize already forwards (w * dpr, h * dpr) to every pass.
    // Calling bloom.setSize(w, h) here as well used to re-size the bloom's
    // internal targets to half resolution, and the whole scene ended up
    // rendered into one corner of the canvas after the first resize event.
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
    return dpr;
  }

  // Run the full path once so the first frame is sized and framed correctly,
  // rather than relying on the constructor calls above matching it.
  resize();

  window.addEventListener('resize', resize);

  // If the GPU drops the context — driver hiccup, memory pressure, waking from
  // sleep — the default behaviour is a permanently dead canvas. Cancelling the
  // event lets the browser hand back a fresh context, and three re-uploads the
  // scene on the next frame.
  let onContextRestored = null;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('WebGL context lost — waiting for it to come back.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('WebGL context restored.');
    resize();
    onContextRestored?.();
  });

  return {
    set onContextRestored(fn) {
      onContextRestored = fn;
    },
    renderer,
    composer,
    bloom,
    grade,
    resize,
    render(dt) {
      // Self-heal the canvas size every frame.
      //
      // Relying on the resize event alone is fragile: it can be missed, it can
      // fire before layout settles, and devicePixelRatio can change without
      // one (moving a window between displays). Any of those leaves the
      // composer's targets out of step with the drawing buffer, and the scene
      // ends up rendered into a corner of a mostly-black canvas.
      //
      // Check the drawing buffer itself rather than just window dimensions —
      // that is the thing that actually goes wrong, so it catches the fault
      // whatever caused it.
      const dpr = pixelRatioFor(window.innerWidth);
      const wantW = Math.floor(window.innerWidth * dpr);
      const wantH = Math.floor(window.innerHeight * dpr);
      const gl = renderer.getContext();
      if (
        gl.drawingBufferWidth !== wantW ||
        gl.drawingBufferHeight !== wantH ||
        composer.renderTarget1.width !== wantW ||
        composer.renderTarget1.height !== wantH
      ) {
        resize();
      }

      grade.uniforms.uTime.value += dt;
      composer.render(dt);
    },
    /** Driven by the sunrise so bloom and grade escalate with the light. */
    sync(skyState) {
      bloom.strength = skyState.bloom;
      grade.uniforms.uWarmth.value = skyState.progress * 0.55;
    },
    setFade(v) {
      grade.uniforms.uFade.value = v;
    },
  };
}
