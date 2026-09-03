import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress } from '../../state/journey'
import { ramp } from '../../rig/acts'
import { ROOM } from '../den/constants'
import { useDenMaterials } from '../den/materials'
import { useSceneryRaycast } from '../den/raycast'
import { DenRoom } from '../den/DenRoom'
import { Desk } from '../den/Desk'
import { useRenderProbe } from '../../ui/renderProbe'
import type { Group, PointLight } from 'three'

/**
 * Act 4 (DECOMPRESSION) and act 5 (THE DEN) — the room that materializes out of
 * the tunnel.
 *
 * This file owns the four things the whole den depends on and nothing else:
 * the shared `reveal` uniform, the two pre-mounted lights, the visibility gate,
 * and the single useFrame that drives every animated decoration. Geometry lives
 * in `scene/den/*`.
 *
 * The one useFrame is a rule, not an accident: a dozen decorations with a dozen
 * frame loops each is a dozen callbacks and a dozen `getState()` reads per
 * frame, for effects that are all functions of the same two numbers.
 */
export function Act5DenShell() {
  useRenderProbe('Act5DenShell')
  const group = useRef<Group>(null)
  const lamp = useRef<PointLight>(null)
  const deskLamp = useRef<PointLight>(null)

  // One uniform object shared by every surface: the room reveals as a single
  // world-space field rather than mesh by mesh.
  const reveal = useMemo<THREE.IUniform<number>>(() => ({ value: 0 }), [])
  const mats = useDenMaterials(reveal)

  useSceneryRaycast(group)

  useFrame(() => {
    const p = getProgress()
    reveal.value = ramp(p, 0.7, 0.85)
    if (group.current) group.current.visible = p > 0.62
    // Lights stay mounted and are dimmed instead of hidden: three keys shader
    // programs on the visible light count, so toggling a light's visibility
    // would recompile every standard material mid-scroll.
    // Physically-correct falloff (three r155+ dropped legacy lights), so these
    // are candela and need to be an order of magnitude above the old numbers.
    if (lamp.current) lamp.current.intensity = 40 * reveal.value
    if (deskLamp.current) deskLamp.current.intensity = 26 * reveal.value
  })

  return (
    <>
      {/* Both lamps are mounted for the entire journey with intensity 0 and
          are ramped up in the den. Mounting a light later would change the
          scene's light count, which is a shader define — every standard
          material would recompile at the act-4 boundary. */}
      <ambientLight intensity={0.2} />
      <pointLight
        ref={lamp}
        position={[1.1, 2.74, ROOM.z + 1.2]}
        color="#ff2450"
        intensity={0}
        distance={20}
      />
      {/* Just above the slab and out at its left edge, so it rakes along the
          desk instead of flooding it from above. Kept off the screens' axis on
          purpose: a small light square-on to a low-roughness screen puts a
          specular hotspot straight down the barrel of the camera, and bloom
          then turns that into a blown-out blob. */}
      <pointLight
        ref={deskLamp}
        position={[-0.98, 1.0, ROOM.z - 0.5]}
        color="#ff003c"
        intensity={0}
        distance={6.5}
      />

      <group ref={group} position={[0, 0, ROOM.z]} visible={false}>
        <DenRoom mats={mats} />
        <Desk mats={mats} />
      </group>
    </>
  )
}
