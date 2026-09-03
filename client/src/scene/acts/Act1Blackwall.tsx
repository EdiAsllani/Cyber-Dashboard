import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney } from '../../state/journey'
import { actWindow } from '../../rig/acts'
import { BlackwallMaterial } from '../materials/blackwallMaterial'
import type { Mesh, Points } from 'three'

/**
 * Act 1 (APPROACH) and the wall's half of act 2 (CONTACT).
 *
 * The wall plane sits at z = 2 facing the incoming camera; dust drifts in the
 * void between the camera's start (z = 26) and the wall so the approach has
 * parallax and the scale reads.
 */

const WALL_Z = 2
const DUST_COUNT = 800
const CYAN_SHARE = 0.08 // netrunner accents stay under the 10% palette budget

/** Energy ramp for act 2: everything swells as the camera closes on the wall. */
const CONTACT_FROM = 0.22
const CONTACT_TO = 0.42

const OCTAVES: Record<'high' | 'medium' | 'low', number> = { high: 5, medium: 5, low: 3 }

function useDust() {
  return useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3)
    const colors = new Float32Array(DUST_COUNT * 3)
    const hot = new THREE.Color('#ff003c')
    const cyan = new THREE.Color('#03d8f3')
    // Deterministic-enough scatter; a fixed seed isn't worth a PRNG here.
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14 + 1.6
      positions[i * 3 + 2] = WALL_Z + Math.random() * 26
      const c = Math.random() < CYAN_SHARE ? cyan : hot
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { positions, colors }
  }, [])
}

export function Act1Blackwall() {
  const wall = useRef<Mesh>(null)
  const dust = useRef<Points>(null)
  const quality = useJourney((s) => s.quality)
  const { positions, colors } = useDust()

  useFrame((state) => {
    const p = getProgress()
    const { reducedMotion } = useJourney.getState()
    const swell = actWindow(p, CONTACT_FROM, CONTACT_TO)
    const time = state.clock.elapsedTime

    const mesh = wall.current
    if (mesh) {
      // Toggle visibility, never unmount — a remount would recompile the
      // shader mid-scroll and hitch exactly at the pierce.
      mesh.visible = p < 0.45
      const m = mesh.material as THREE.ShaderMaterial & {
        uTime: number
        uIntensity: number
        uWarp: number
        uGlitch: number
        uDisplace: number
      }
      m.uTime = time
      m.uIntensity = 0.55 + swell * 0.45
      m.uWarp = 0.6 + swell * 0.8
      // Reduced motion keeps the wall alive but never strobes the slices.
      m.uGlitch = reducedMotion ? 0.08 : 0.08 + swell * 0.82
      m.uDisplace = 0.35 + swell * 0.85
    }

    const cloud = dust.current
    if (cloud) {
      cloud.visible = p < 0.45
      // Whole-cloud drift: cheaper than touching 800 vertices every frame.
      cloud.rotation.z = time * 0.012
      cloud.position.y = Math.sin(time * 0.13) * 0.4
    }
  })

  return (
    <group>
      <mesh ref={wall} position={[0, 1.6, WALL_Z]}>
        <planeGeometry args={[48, 20, 160, 72]} />
        <blackwallMaterial
          key={`${BlackwallMaterial.key}-${quality}`}
          defines={{ FBM_OCTAVES: String(OCTAVES[quality]) }}
        />
      </mesh>

      <points ref={dust} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
