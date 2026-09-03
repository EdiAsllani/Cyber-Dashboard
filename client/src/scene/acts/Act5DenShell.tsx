import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress } from '../../state/journey'
import { ramp } from '../../rig/acts'
import { createDissolveMaterial } from '../materials/dissolveMaterial'
import type { Group, PointLight } from 'three'

/**
 * Act 4 (DECOMPRESSION) and act 5 (THE DEN) — a placeholder room shell that
 * materializes out of the tunnel.
 *
 * Phase 3 replaces the internals with the real office; the seam to keep is this
 * component's boundary and the shared `reveal` uniform, not the geometry.
 */

const ROOM_Z = -52
const ROOM_W = 10
const ROOM_D = 10
const ROOM_H = 3.2
const WALL = 0.2

export function Act5DenShell() {
  const group = useRef<Group>(null)
  const lamp = useRef<PointLight>(null)
  const deskLamp = useRef<PointLight>(null)

  // One uniform object shared by every surface: the room reveals as a single
  // world-space field rather than mesh by mesh.
  const reveal = useMemo<THREE.IUniform<number>>(() => ({ value: 0 }), [])

  const materials = useMemo(() => {
    const shell = createDissolveMaterial(
      { color: '#0d0d0d', roughness: 0.85, metalness: 0.12 },
      reveal,
    )
    const neon = createDissolveMaterial(
      {
        color: '#0d0d0d',
        emissive: new THREE.Color('#c5003c'),
        emissiveIntensity: 2.5,
        roughness: 0.4,
        toneMapped: false,
      },
      reveal,
    )
    const desk = createDissolveMaterial(
      { color: '#080808', roughness: 0.6, metalness: 0.3 },
      reveal,
    )
    const screen = createDissolveMaterial(
      {
        color: '#050505',
        emissive: new THREE.Color('#c5003c'),
        emissiveIntensity: 1.05,
        roughness: 0.25,
        toneMapped: false,
      },
      reveal,
    )
    return { shell, neon, desk, screen }
  }, [reveal])

  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose()
    },
    [materials],
  )

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
    if (deskLamp.current) deskLamp.current.intensity = 10 * reveal.value
  })

  return (
    <>
      {/* Both lamps are mounted for the entire journey with intensity 0 and
          are ramped up in the den. Mounting a light later would change the
          scene's light count, which is a shader define — every standard
          material would recompile at the act-4 boundary. */}
      <ambientLight intensity={0.15} />
      <pointLight
        ref={lamp}
        position={[0, 2.6, ROOM_Z + 1.5]}
        color="#ff2450"
        intensity={0}
        distance={20}
      />
      <pointLight
        ref={deskLamp}
        position={[0, 1.3, ROOM_Z - 0.4]}
        color="#ff003c"
        intensity={0}
        distance={6}
      />

      <group ref={group} position={[0, 0, ROOM_Z]} visible={false}>
        {/* floor / ceiling */}
        <mesh material={materials.shell} position={[0, -WALL / 2, 0]} receiveShadow>
          <boxGeometry args={[ROOM_W, WALL, ROOM_D]} />
        </mesh>
        <mesh material={materials.shell} position={[0, ROOM_H + WALL / 2, 0]}>
          <boxGeometry args={[ROOM_W, WALL, ROOM_D]} />
        </mesh>
        {/* back wall + sides */}
        <mesh material={materials.shell} position={[0, ROOM_H / 2, -ROOM_D / 2]}>
          <boxGeometry args={[ROOM_W, ROOM_H, WALL]} />
        </mesh>
        <mesh material={materials.shell} position={[-ROOM_W / 2, ROOM_H / 2, 0]}>
          <boxGeometry args={[WALL, ROOM_H, ROOM_D]} />
        </mesh>
        <mesh material={materials.shell} position={[ROOM_W / 2, ROOM_H / 2, 0]}>
          <boxGeometry args={[WALL, ROOM_H, ROOM_D]} />
        </mesh>

        {/* neon trim: floor-to-wall seams and a ceiling strip */}
        <mesh material={materials.neon} position={[0, 0.06, -ROOM_D / 2 + 0.14]}>
          <boxGeometry args={[ROOM_W - 0.4, 0.04, 0.04]} />
        </mesh>
        <mesh material={materials.neon} position={[-ROOM_W / 2 + 0.14, 0.06, 0]}>
          <boxGeometry args={[0.04, 0.04, ROOM_D - 0.4]} />
        </mesh>
        <mesh material={materials.neon} position={[ROOM_W / 2 - 0.14, 0.06, 0]}>
          <boxGeometry args={[0.04, 0.04, ROOM_D - 0.4]} />
        </mesh>
        <mesh material={materials.neon} position={[0, ROOM_H - 0.1, -ROOM_D / 2 + 0.16]}>
          <boxGeometry args={[ROOM_W - 1.6, 0.05, 0.05]} />
        </mesh>
        <mesh material={materials.neon} position={[-ROOM_W / 2 + 0.16, ROOM_H - 0.1, 0]}>
          <boxGeometry args={[0.05, 0.05, ROOM_D - 1.6]} />
        </mesh>
        <mesh material={materials.neon} position={[ROOM_W / 2 - 0.16, ROOM_H - 0.1, 0]}>
          <boxGeometry args={[0.05, 0.05, ROOM_D - 1.6]} />
        </mesh>

        {/* desk + the two monitors Phase 3 turns into terminals */}
        <mesh material={materials.desk} position={[0, 0.72, -0.8]}>
          <boxGeometry args={[2.4, 0.06, 0.8]} />
        </mesh>
        <mesh material={materials.desk} position={[0, 0.36, -0.8]}>
          <boxGeometry args={[2.2, 0.66, 0.06]} />
        </mesh>
        {/* Bezel + screen per monitor. Phase 3 swaps the screen planes for
            real render targets / Html terminals; the transforms stay. */}
        <group position={[-0.34, 1.05, -1.06]} rotation={[0, 0.14, 0]}>
          <mesh material={materials.desk}>
            <boxGeometry args={[0.66, 0.435, 0.04]} />
          </mesh>
          <mesh material={materials.screen} position={[0, 0, 0.025]}>
            <planeGeometry args={[0.6, 0.375]} />
          </mesh>
        </group>
        <group position={[0.34, 1.05, -1.06]} rotation={[0, -0.14, 0]}>
          <mesh material={materials.desk}>
            <boxGeometry args={[0.66, 0.435, 0.04]} />
          </mesh>
          <mesh material={materials.screen} position={[0, 0, 0.025]}>
            <planeGeometry args={[0.6, 0.375]} />
          </mesh>
        </group>
      </group>
    </>
  )
}
