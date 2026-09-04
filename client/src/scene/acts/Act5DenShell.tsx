import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney, type Quality } from '../../state/journey'
import { ramp } from '../../rig/acts'
import { ROOM } from '../den/constants'
import { useDenMaterials } from '../den/materials'
import { useSceneryRaycast } from '../den/raycast'
import { DenRoom } from '../den/DenRoom'
import { Desk } from '../den/Desk'
import { Props } from '../den/Props'
import { MonitorScreens, useMonitorScreens } from '../den/MonitorScreens'
import { Decor, ledColor, RACK_LEDS } from '../den/Decor'
import { NeonSigns, useNeonSigns } from '../den/NeonSigns'
import { useRenderProbe } from '../../ui/renderProbe'
import type { AmbientLight, Group, InstancedMesh, PointLight } from 'three'

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
/** LED rewrite rate per tier — how often the rack's blink lottery redraws. */
const BLINK_HZ: Record<Quality, number> = { high: 3, medium: 2, low: 1 }

export function Act5DenShell() {
  useRenderProbe('Act5DenShell')
  const group = useRef<Group>(null)
  const ambient = useRef<AmbientLight>(null)
  const lamp = useRef<PointLight>(null)
  const deskLamp = useRef<PointLight>(null)
  const leds = useRef<InstancedMesh>(null)
  const lastBlink = useRef(-1)

  // Selector, not getState: the decor's segment counts and LED count are
  // props, so a tier change must re-render. Quality flips a handful of times
  // per session at most.
  const quality = useJourney((s) => s.quality)

  // One uniform object shared by every surface: the room reveals as a single
  // world-space field rather than mesh by mesh.
  const reveal = useMemo<THREE.IUniform<number>>(() => ({ value: 0 }), [])
  const mats = useDenMaterials(reveal)
  const monitors = useMonitorScreens(reveal)
  const signs = useNeonSigns()

  // Re-walk after a tier change: the tier swaps tube geometry, and any mesh
  // that appeared since the last walk would otherwise be raycastable.
  useSceneryRaycast(group, [quality])

  useFrame((state) => {
    const p = getProgress()
    const { mode, quality, reducedMotion } = useJourney.getState()
    reveal.value = ramp(p, 0.7, 0.85)
    const visible = p > 0.62
    if (group.current) group.current.visible = visible

    // The screens keep painting while the room is on screen and stop dead
    // when it isn't — hidden behind the tunnel, or behind the terminal
    // overlay. A CanvasTexture upload is a megabyte a pop; there is no point
    // paying it for pixels nobody can see.
    const t = state.clock.elapsedTime
    monitors.tick(t, quality, visible && mode !== 'terminal', reducedMotion)
    // Lights stay mounted and are dimmed instead of hidden: three keys shader
    // programs on the visible light count, so toggling a light's visibility
    // would recompile every standard material mid-scroll.
    // Physically-correct falloff (three r155+ dropped legacy lights), so these
    // are candela and need to be an order of magnitude above the old numbers.
    if (lamp.current) lamp.current.intensity = 40 * reveal.value
    if (deskLamp.current) deskLamp.current.intensity = 26 * reveal.value
    // The ceiling ducts and the far corners sit outside both lamps' reach, so
    // the den gets a base fill the journey never had. Intensity is not a
    // shader define — ramping it recompiles nothing.
    if (ambient.current) ambient.current.intensity = 0.2 + 0.25 * reveal.value

    // The signs can't take the dissolve patch (troika material), so they fade
    // from the same reveal value instead — and run their flicker lottery.
    signs.tick(reveal.value, t, reducedMotion)

    // The one live cable run breathes; everything below only runs while the
    // room is actually on screen.
    if (!visible) return
    mats.cableHot.emissiveIntensity = reducedMotion ? 1.3 : 1.0 + 0.5 * Math.sin(t * 1.7)

    // Rack LED blink: on a per-tier grid, re-roll ~8 studs. A 72-colour buffer
    // re-upload is trivial; what matters is not doing it every frame.
    const slot = Math.floor(t * BLINK_HZ[quality])
    const mesh = leds.current
    if (!reducedMotion && slot !== lastBlink.current && mesh?.instanceColor) {
      lastBlink.current = slot
      const count = RACK_LEDS[quality]
      for (let k = 0; k < 8; k++) {
        const i = Math.floor(hash(slot * 8 + k) * count)
        mesh.setColorAt(i, ledColor(i, hash(slot * 8 + k + 41) > 0.5))
      }
      mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      {/* Both lamps are mounted for the entire journey with intensity 0 and
          are ramped up in the den. Mounting a light later would change the
          scene's light count, which is a shader define — every standard
          material would recompile at the act-4 boundary. */}
      <ambientLight ref={ambient} intensity={0.2} />
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
        <Props mats={mats} />
        <MonitorScreens screens={monitors.screens} />
        <Decor mats={mats} quality={quality} leds={leds} />
        <NeonSigns mats={mats} signs={signs} />
      </group>
    </>
  )
}

/** Deterministic 0..1 from an integer — a paused frame looks identical. */
function hash(n: number): number {
  const x = Math.sin(n * 73.3) * 51269.2653
  return x - Math.floor(x)
}
