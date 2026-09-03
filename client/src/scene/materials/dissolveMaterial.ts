import * as THREE from 'three'
import { NOISE_CHUNK } from './glsl/noise'

/**
 * MeshStandardMaterial patched to materialize out of nothing.
 *
 * A noise field in world space is compared against `uReveal`: below the
 * threshold the fragment is discarded, and fragments just above it get a hot
 * emissive rim, so the room appears to burn itself into existence rather than
 * fading in. Every surface of the shell shares one `uReveal` uniform object, so
 * the whole room reveals as a single coherent field instead of per-mesh.
 *
 * onBeforeCompile rather than a full custom material: we still want the PBR
 * lighting from the standard material, only with a cutout on top.
 */
export function createDissolveMaterial(
  params: THREE.MeshStandardMaterialParameters,
  reveal: THREE.IUniform<number>,
  edge: THREE.Vector3 = new THREE.Vector3(2.6, 0.0, 0.32),
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(params)

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = reveal
    shader.uniforms.uDissolveEdge = { value: edge }

    shader.vertexShader =
      'varying vec3 vDissolveWorld;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vDissolveWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )

    shader.fragmentShader =
      `uniform float uReveal;
uniform vec3 uDissolveEdge;
varying vec3 vDissolveWorld;
${NOISE_CHUNK}
` +
      shader.fragmentShader
        // Top of main(): discard before any lighting work is done.
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  float dNoise = clamp(fbm3(vDissolveWorld * 0.55) * 0.5 + 0.5, 0.0, 1.0);
  float dEdge = dNoise + uReveal * 2.0 - 1.0;
  if (dEdge < 0.0) discard;`,
        )
        // Right after gl_FragColor exists, and before tone mapping, so the rim
        // lands in the frame as an HDR value that bloom will catch.
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
  gl_FragColor.rgb += uDissolveEdge * (1.0 - smoothstep(0.0, 0.14, dEdge)) * (1.0 - step(0.999, uReveal));`,
        )
  }

  // three's program cache key does not account for onBeforeCompile, so without
  // this a patched material could be handed an unpatched program (or vice
  // versa) whenever both kinds of standard material exist in one scene.
  material.customProgramCacheKey = () => 'blackwall-dissolve'

  return material
}
