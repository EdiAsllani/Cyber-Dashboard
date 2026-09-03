import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney } from '../../state/journey'
import { ramp, smoothstep } from '../../rig/acts'
import { useRenderProbe } from '../../ui/renderProbe'
import type { Group, InstancedMesh, MeshBasicMaterial } from 'three'

/**
 * Act 3 (BREACH) — the data tunnel behind the wall.
 *
 * A hollow cylinder of thin emissive streaks around the camera path, plus a few
 * oversized rings as scale landmarks. One instanced mesh, so the whole tunnel
 * costs a single draw call.
 */

/** The camera travels z ≈ -1 → -46 across acts 3 and 4. */
const TUNNEL_NEAR = 0
/**
 * Length of the wrapped band. Kept short on purpose: streaks are recycled just
 * shy of 40 units ahead, where a 0.04 cross-section is under a pixel, so they
 * pop in invisibly. A longer band would need distance fading to hide the seam.
 */
const SPAN = 48
/**
 * Deliberately below the 2500/1200/600 the plan sketched. At that count the
 * band renders as a continuous sheet of light — a hyperspace jump rather than a
 * data conduit — regardless of radius or thickness. The allocation stays at
 * 2500 so a tier change only moves `mesh.count` and never reallocates.
 */
const MAX_COUNT = 2500
const COUNT: Record<'high' | 'medium' | 'low', number> = { high: 900, medium: 550, low: 320 }
// Wide radial spread, not a tight sleeve: at radius 2 with 2500 streaks the
// tunnel becomes a solid wall of light (hyperspace, not a data conduit). Most
// of the count lives out at the periphery and only some cross the view.
const RADIUS_MIN = 4
const RADIUS_MAX = 13
const CYAN_SHARE = 0.06
const FLOW = 9 // world units/second of streaming even when the scroll is still

const RING_COUNT = 3
const RING_RADIUS = 8.2

/** HDR colours: above 1.0 so bloom, and only bloom, picks the streaks up. */
const STREAK_RED = new THREE.Color(1.2, 0.0, 0.09)
const STREAK_CYAN = new THREE.Color(0.03, 0.95, 1.2)

function useStreaks() {
  return useMemo(() => {
    // Column-major 4x4 matrices, laid out once. Only element 14 (translation z)
    // is touched per frame — one float write per instance instead of composing
    // and uploading a fresh matrix, which is what makes 2500 moving streaks
    // essentially free on the CPU.
    const matrices = new Float32Array(MAX_COUNT * 16)
    const z = new Float32Array(MAX_COUNT)
    const colors = new Float32Array(MAX_COUNT * 3)

    for (let i = 0; i < MAX_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = RADIUS_MIN + Math.random() * (RADIUS_MAX - RADIUS_MIN)
      const len = 0.4 + Math.random() * 0.9
      const o = i * 16
      matrices[o + 0] = 1
      matrices[o + 5] = 1
      matrices[o + 10] = len
      matrices[o + 15] = 1
      matrices[o + 12] = Math.cos(angle) * radius
      matrices[o + 13] = Math.sin(angle) * radius + 1.6
      z[i] = TUNNEL_NEAR - Math.random() * SPAN
      matrices[o + 14] = z[i]

      const c = Math.random() < CYAN_SHARE ? STREAK_CYAN : STREAK_RED
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { matrices, z, colors }
  }, [])
}

export function Act3Tunnel() {
  useRenderProbe('Act3Tunnel')
  const mesh = useRef<InstancedMesh>(null)
  const rings = useRef<Group>(null)
  const quality = useJourney((s) => s.quality)
  const { matrices, z, colors } = useStreaks()
  const flow = useRef(0)

  // Element 14 of every matrix is rewritten each frame; tell the driver.
  useEffect(() => {
    mesh.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  useFrame((state, dt) => {
    const p = getProgress()
    const camZ = state.camera.position.z
    // Reduced motion: streaks stop streaming on their own and only move
    // because the camera does.
    const flowRate = useJourney.getState().reducedMotion ? 0 : FLOW

    // Fade in behind the pierce flash, fade out as the room materializes —
    // a hard visibility flip at either end would pop.
    const alpha = ramp(p, 0.33, 0.42) * (1 - ramp(p, 0.68, 0.83))
    const live = alpha > 0.001

    flow.current += dt * flowRate

    const m = mesh.current
    if (m) {
      m.visible = live
      m.count = COUNT[quality]
      ;(m.material as MeshBasicMaterial).opacity = 0.6 * alpha

      if (live) {
        const arr = m.instanceMatrix.array as Float32Array
        const drift = dt * flowRate
        const recycleAt = camZ + 6
        for (let i = 0; i < m.count; i++) {
          let zi = z[i] + drift
          if (zi > recycleAt) zi -= SPAN
          z[i] = zi
          arr[i * 16 + 14] = zi
        }
        m.instanceMatrix.needsUpdate = true
      }
    }

    const g = rings.current
    if (g) {
      g.visible = live
      for (let i = 0; i < g.children.length; i++) {
        const ring = g.children[i]
        // Evenly spaced, wrapped into the same band as the streaks.
        const base = TUNNEL_NEAR - ((i * SPAN) / RING_COUNT + flow.current) % SPAN
        const z = base > camZ + 6 ? base - SPAN : base
        ring.position.z = z
        // Rings are metres across, so unlike the streaks they would visibly pop
        // in at the recycle distance — fade them up over the last 12 units.
        const dist = camZ - z
        const mat = (ring as THREE.Mesh).material as MeshBasicMaterial
        mat.opacity = alpha * smoothstep(SPAN - 2, SPAN - 14, dist)
      }
    }
  })

  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, MAX_COUNT]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[0.04, 0.04, 3.5]} />
        {/* Two non-obvious flags here.
            fog={false} is load-bearing: scene fog mixes a fragment toward the
            fog colour, and mixing an ADDITIVE fragment toward near-black means
            it contributes nothing — fogged additive geometry simply vanishes.
            And `vertexColors` must stay OFF despite the per-instance colours:
            three defines USE_COLOR in the *fragment* prefix whenever an
            instanceColor exists, while the vertex prefix only gets it from
            material.vertexColors — so turning it on makes the vertex shader
            multiply by a `color` attribute this geometry doesn't have, and
            every streak renders black. */}
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0.6}
          toneMapped={false}
          fog={false}
        />
        <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
      </instancedMesh>

      <group ref={rings}>
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <mesh key={i} position={[0, 1.6, 0]} raycast={() => null}>
            <torusGeometry args={[RING_RADIUS, 0.035, 6, 72]} />
            <meshBasicMaterial
              color={new THREE.Color(1.25, 0.0, 0.12)}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              transparent
              toneMapped={false}
              fog={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}
