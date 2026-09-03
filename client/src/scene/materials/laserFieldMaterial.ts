import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, type ThreeElement } from '@react-three/fiber'

/**
 * THE BLACKWALL, take two — a holographic lattice of laser beams.
 *
 * One InstancedMesh of crossed quads, each instance a dashed beam. The look
 * (reference: docs/research/02 + Edi's brief): abundant vertical lasers spread
 * through a deep volume, dashes drifting downward, everything brightening
 * toward a white-hot horizon line at eye height. The camera walks BETWEEN the
 * beams; depth is sold by a per-fragment distance fade rather than scene fog.
 *
 * Per-instance variation arrives via `aSeed` (an InstancedBufferAttribute):
 *   x — random phase (also derives dash density and duty cycle)
 *   y — dash drift speed
 *   z — brightness (heavily skewed: few beams are hot)
 *   w — color mix toward white-core (only near the horizon)
 *
 * Uniform drivers live in Act1Blackwall; this file owns look, not timing.
 */

const vertexShader = /* glsl */ `
attribute vec4 aSeed;

varying vec2 vUv;
varying vec4 vSeed;
varying float vDist;
varying float vWorldY;

void main() {
  vUv = uv;
  vSeed = aSeed;

  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorldY = wp.y;

  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBoost;
uniform float uFade;
uniform float uHorizonY;
uniform vec3 uColorDeep;
uniform vec3 uColorHot;
uniform vec3 uColorCore;

varying vec2 vUv;
varying vec4 vSeed;
varying float vDist;
varying float vWorldY;

void main() {
  // Soft beam profile across the quad's width — a laser, not a ribbon.
  // The base is clamped because at the quad's exact edge it can land a hair
  // below zero, and pow(negative, fract) is NaN — a single NaN fragment
  // propagates through bloom's mipmap chain and blacks out the whole frame.
  float beam = pow(max(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0), 1.8);

  // Dashes along the beam. Density and duty cycle both derive from the phase
  // seed so no two beams share a pattern; adding time to the phase drifts the
  // dashes DOWNWARD (features live where fract(y*c + t) is constant).
  float cells = mix(5.0, 26.0, fract(vSeed.x * 7.31));
  float duty = mix(0.30, 0.78, fract(vSeed.x * 3.17));
  float f = fract(vUv.y * cells + vSeed.x * 97.0 + uTime * vSeed.y);
  // Soft-edged dash: hard step at the tail, a short ease at the head.
  float dash = smoothstep(1.0 - duty, 1.0 - duty + 0.08, f) * smoothstep(1.0, 0.96, f);

  // Everything brightens toward the horizon line — the wall's power source.
  float horizon = exp(-abs(vWorldY - uHorizonY) * 0.34);

  // Depth fade: beams dissolve into the void with distance instead of popping
  // at the far edge of the field. Scene fog is left alone (acts 3-5 own it).
  float depth = exp(-max(vDist - 9.0, 0.0) * 0.038);

  vec3 col = mix(uColorDeep, uColorHot, min(vSeed.z * 1.6, 1.0));
  col = mix(col, uColorCore, vSeed.w * horizon);

  float intensity = beam * dash * (0.30 + vSeed.z * 0.85) * depth;
  intensity *= 1.0 + horizon * (1.6 + uBoost * 3.2);
  intensity *= 1.0 + uBoost * 0.9;

  // Beam ends taper instead of cutting.
  intensity *= smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);

  // Hot beams near the horizon exceed 1.0 on purpose: bloom food.
  // uFade retires the whole field under the pierce flash; with additive
  // blending, scaling the colour is exactly a fade to nothing.
  gl_FragColor = vec4(col * intensity * uFade, 1.0);
}
`

/** Palette from styles.css. Colors must be THREE.Color — hex strings never upload. */
export const LASERFIELD_UNIFORMS = {
  uTime: 0,
  uBoost: 0,
  uFade: 1,
  uHorizonY: 1.6,
  uColorDeep: new THREE.Color('#880425'),
  uColorHot: new THREE.Color('#ff003c'),
  uColorCore: new THREE.Color('#fff2f4'),
}

export const LaserFieldMaterial = shaderMaterial(LASERFIELD_UNIFORMS, vertexShader, fragmentShader)

extend({ LaserFieldMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    laserFieldMaterial: ThreeElement<typeof LaserFieldMaterial>
  }
}
