import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, type ThreeElement } from '@react-three/fiber'

/**
 * The horizon — the white-to-red band of light the whole laser field feeds
 * into (the bright core in the reference image). A single big additive quad
 * behind the field: a white-hot core line, a hot-red glow, a wide deep-red
 * haze, and per-column light spikes that read as distant data towers.
 *
 * Act 2 drives `uBoost`: the light both brightens AND thickens, so by the
 * pierce it owns the frame and the DOM flash only has to finish the job.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBoost;
uniform float uFade;
uniform float uHeight;
uniform vec3 uColorHot;
uniform vec3 uColorDeep;

varying vec2 vUv;

float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  // World-space distance from the center line; boost thickens the light.
  float d = abs(vUv.y - 0.5) * uHeight;
  d /= 1.0 + uBoost * 1.7;

  // Column-quantized variation: a static profile per column plus a flicker
  // that re-rolls ~10x a second. This is what keeps the band alive without
  // any noise texture.
  float col = floor(vUv.x * 420.0);
  float profile = hash11(col * 3.71);
  float flick = 0.78 + 0.22 * hash11(col * 1.93 + floor(uTime * 10.0) * 7.7);

  float core = exp(-d * 15.0);
  float glow = exp(-d * 2.5);
  float haze = exp(-d * 0.5);
  // Sparse vertical spikes rising from the line, height varying per column.
  float spike = pow(max(profile, 0.0), 9.0) * exp(-d * (0.9 + 5.0 * hash11(col * 9.1)));

  vec3 c = vec3(1.0, 0.96, 0.96) * core * (2.4 + uBoost * 7.0); // HDR: bloom food
  c += uColorHot * glow * (1.15 + uBoost * 2.4) * flick;
  c += uColorDeep * haze * 0.55;
  c += uColorHot * spike * (1.3 + uBoost * 1.6);

  // Fade out at the plane's left/right edges so it has no visible frame.
  c *= smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);

  gl_FragColor = vec4(c * uFade, 1.0);
}
`

export const HORIZON_UNIFORMS = {
  uTime: 0,
  uBoost: 0,
  uFade: 1,
  uHeight: 24,
  uColorHot: new THREE.Color('#ff003c'),
  uColorDeep: new THREE.Color('#880425'),
}

export const HorizonMaterial = shaderMaterial(HORIZON_UNIFORMS, vertexShader, fragmentShader)

extend({ HorizonMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    horizonMaterial: ThreeElement<typeof HorizonMaterial>
  }
}
