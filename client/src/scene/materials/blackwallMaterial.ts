import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, type ThreeElement } from '@react-three/fiber'
import { NOISE_CHUNK } from './glsl/noise'

/**
 * THE BLACKWALL.
 *
 * Domain-warped FBM (iq's recipe: v = fbm(p + fbm(p + fbm(p)))) remapped
 * through a void → blood → arasaka → hot ramp, with crawling emissive bands
 * and ridged-noise lightning filaments deliberately pushed past 1.0 so the
 * bloom pass — and only the bloom pass — picks them up.
 *
 * Uniform drivers live in Act1Blackwall; this file owns look, not timing.
 */

const vertexShader = /* glsl */ `
${NOISE_CHUNK}

uniform float uTime;
uniform float uDisplace;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  // The wall breathes toward the viewer. Same noise field as the fragment
  // pass, so bright regions bulge and dark ones recede.
  pos.z += fbm(vec3(position.xy * 0.18, uTime * 0.15)) * uDisplace;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const fragmentShader = /* glsl */ `
${NOISE_CHUNK}

uniform float uTime;
uniform float uIntensity;
uniform float uWarp;
uniform float uGlitch;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

varying vec2 vUv;

// Cheap hash — only ever used for the glitch slice lottery.
float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  // Stretch: a wall reads wider than tall, and the noise must not look tiled.
  vec2 uv = vUv * vec2(5.0, 2.2);

  // Glitch slices: quantized rows win a lottery each 1/8 s and shove sideways.
  // Done before the noise lookup so displaced rows sample a different field.
  float row = floor(vUv.y * 96.0);
  float slice = step(1.0 - uGlitch * 0.12, hash11(row * 91.17 + floor(uTime * 8.0) * 13.7));
  uv.x += slice * (hash11(row * 17.3) - 0.5) * 0.35;

  // Domain-warped FBM — the boiling. Three chained lookups (iq's warp recipe);
  // the frequency is tuned so features land at roughly 3-5 world units.
  // The two warp lookups only bend the domain, so they run at 3 octaves; only
  // the final field pays for FBM_OCTAVES. That is 11 simplex evaluations per
  // fragment instead of 15, and the difference is not visible.
  vec3 p = vec3(uv * 2.4, uTime * 0.06);
  float q = fbm3(p);
  float r = fbm3(p + q * uWarp + vec3(1.7, 9.2, uTime * 0.10));
  float v = clamp(fbm(p + r * uWarp) * 0.5 + 0.5, 0.0, 1.0);

  // Colour is layered ADDITIVELY over black rather than mixed up from a base:
  // mixing floods the whole plane with red, and the Blackwall has to be mostly
  // void with energy running through it.
  vec3 col = uColorA * smoothstep(0.46, 0.74, v) * 0.30;
  col += uColorB * smoothstep(0.68, 0.92, v) * 0.42;
  col += uColorC * smoothstep(0.86, 0.99, v) * 0.85;

  // Where the wall is energetic at all — gates the bands so they never draw
  // straight rules across the empty void.
  float energy = smoothstep(0.46, 0.94, v);

  // Upward-crawling emissive bands, phase-warped by the noise so they bend
  // with the field instead of reading as venetian blinds.
  float bandPhase = vUv.y * 10.0 - uTime * 0.5 + q * 0.9;
  float band = smoothstep(0.72, 1.0, sin(bandPhase * 6.2831) * 0.5 + 0.5);
  col += uColorC * band * energy * 0.35 * uIntensity;

  // Lightning filaments. Ridged noise alone is broad (|noise| sits near 0 over
  // large areas), so the zero-crossing contour is isolated with smoothstep —
  // that is what turns a red blob into a thin arc. The field is fbm3, not plain
  // simplex, because the contour of a fractal field is jagged where the contour
  // of a single octave is a smooth topographic loop. Output is deliberately
  // > 1.0: bloom food.
  float n1 = fbm3(vec3(uv * 1.5, uTime * 0.22));
  // The secondary contour is a single octave: it is only ever multiplied into
  // the primary, so its smoothness never shows.
  float n2 = snoise(vec3(uv * 0.85 + 5.0, uTime * 0.13));
  float f1 = smoothstep(0.982, 1.0, 1.0 - abs(n1));
  float f2 = smoothstep(0.945, 1.0, 1.0 - abs(n2));
  // Breakup mask: without it the contours close into continuous cell walls.
  // Reuses the first warp lookup rather than sampling the field again.
  float mask = smoothstep(0.30, 0.80, q * 0.5 + 0.5);
  float fil = (f1 * 0.5 + f1 * f2 * 2.4) * mask;
  col += uColorC * fil * (0.8 + uIntensity * 1.8);

  // Digital static: a sparse lottery of hot pixels, only inside energetic
  // regions. Cheap, and it is what stops the wall reading as smoke.
  float grain = hash11(floor(vUv.x * 900.0) * 3.7 + floor(vUv.y * 520.0) * 11.3 + floor(uTime * 24.0) * 7.1);
  col += uColorC * step(0.9965, grain) * 1.1 * energy;

  // Dissolve the wall's top and bottom edges into the void so it has no seam.
  col *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);

  gl_FragColor = vec4(col, 1.0);
}
`

/** Palette from styles.css. Colors must be THREE.Color — hex strings never upload. */
export const BLACKWALL_UNIFORMS = {
  uTime: 0,
  uIntensity: 0.55,
  uWarp: 0.6,
  uGlitch: 0.08,
  uDisplace: 0.35,
  uColorA: new THREE.Color('#880425'),
  uColorB: new THREE.Color('#c5003c'),
  uColorC: new THREE.Color('#ff003c'),
}

export const BlackwallMaterial = shaderMaterial(BLACKWALL_UNIFORMS, vertexShader, fragmentShader)

extend({ BlackwallMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    blackwallMaterial: ThreeElement<typeof BlackwallMaterial>
  }
}
