import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney, type Quality } from '../../state/journey'
import { actWindow, ramp } from '../../rig/acts'
import { useRenderProbe } from '../../ui/renderProbe'
import '../materials/laserFieldMaterial'
import '../materials/horizonMaterial'
import type { Group, InstancedMesh, Mesh, Points, ShaderMaterial } from 'three'

/**
 * Act 1 (APPROACH) and the wall's half of act 2 (CONTACT).
 *
 * The Blackwall is a holographic lattice: thousands of dashed laser beams —
 * mostly vertical, a few horizontal accents — filling a deep volume the camera
 * walks THROUGH (beams span z ∈ [-6, 24]; the camera dives from z = 26 to ~1),
 * all of it feeding a white-hot horizon line at eye height behind the field.
 * Approaching the horizon makes it grow on screen; act 2 boosts it until the
 * pierce flash finishes the whiteout and covers the swap to the tunnel.
 *
 * A narrow jittered corridor along the camera path is kept clear of eye-height
 * beams, so the dive threads BETWEEN lasers instead of clipping through them.
 */

const HORIZON_Y = 1.6
const HORIZON_Z = -14
// The camera starts at z = 26 and dives to ~1, so the field's near edge sits
// BEHIND the start (z = 30): the camera is enveloped in lasers from t = 0
// rather than approaching an empty edge, and the horizon at z = -14 grows on
// screen as it is approached.
const FIELD_NEAR_Z = 30
const FIELD_SPAN_Z = 46 // beams live in (FIELD_NEAR_Z - span, FIELD_NEAR_Z]

const DUST_COUNT = 800
const CYAN_SHARE = 0.08 // netrunner accents stay under the 10% palette budget

/** Energy ramp for act 2: everything swells as the camera closes on the horizon. */
const CONTACT_FROM = 0.22
const CONTACT_TO = 0.42

/**
 * The retirement window. The pierce flash peaks around t = 0.375, so the field
 * fades to nothing underneath it: by the time the flash decays the wall is
 * gone and only the tunnel remains — whiteout, dark, next view.
 */
const FADE_FROM = 0.345
const FADE_TO = 0.4

const BEAM_COUNTS: Record<Quality, number> = { high: 5200, medium: 2800, low: 1300 }

/** The uniforms both wall materials share and this act drives every frame. */
type LaserUniforms = ShaderMaterial & { uTime: number; uBoost: number; uFade: number }

/** Two unit quads crossed at 90° — a beam that reads from every angle. */
function makeCrossQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  // prettier-ignore
  const positions = new Float32Array([
    -0.5, -0.5, 0,   0.5, -0.5, 0,   0.5, 0.5, 0,   -0.5, 0.5, 0, // facing z
    0, -0.5, -0.5,   0, -0.5, 0.5,   0, 0.5, 0.5,   0, 0.5, -0.5, // facing x
  ])
  // prettier-ignore
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ])
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return g
}

/** Scatter one beam; returns everything the instance matrix needs. */
function scatterBeam() {
  const horizontal = Math.random() < 0.12
  // Slight bias toward the far end so density builds with depth.
  const z = FIELD_NEAR_Z - FIELD_SPAN_Z * Math.pow(Math.random(), 0.85)
  let x = (Math.random() - 0.5) * 92
  // Sum of two randoms: beams cluster around the horizon band like the reference.
  const y = HORIZON_Y + (Math.random() + Math.random() - 1) * (horizontal ? 3.2 : 4.4)
  const len = horizontal
    ? 3 + Math.random() * 13
    : Math.random() < 0.3
      ? 2 + Math.random() * 5 // short strokes
      : 12 + Math.random() * 22 // full lasers
  const width = 0.015 + Math.random() * Math.random() * 0.05

  // The camera aisle: any beam that would cross eye height near the path gets
  // pushed out to a jittered corridor edge — near misses, never a face-full.
  const coversEye = !horizontal && Math.abs(HORIZON_Y - y) < len / 2 + 0.5
  const edge = 1.0 + Math.random() * 0.5
  if (coversEye && Math.abs(x) < edge) {
    x = Math.sign(x || 1) * (edge + Math.random() * 0.6)
  }

  const rotY = Math.random() * Math.PI
  const rotZ = horizontal
    ? Math.PI / 2 + (Math.random() - 0.5) * 0.08
    : (Math.random() - 0.5) * 0.05

  return { x, y, z, len, width, rotY, rotZ }
}

function useDust() {
  return useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3)
    const colors = new Float32Array(DUST_COUNT * 3)
    const hot = new THREE.Color('#ff003c')
    const cyan = new THREE.Color('#03d8f3')
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14 + HORIZON_Y
      positions[i * 3 + 2] = -14 + Math.random() * 44
      const c = Math.random() < CYAN_SHARE ? cyan : hot
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { positions, colors }
  }, [])
}

export function Act1Blackwall() {
  useRenderProbe('Act1Blackwall')
  const group = useRef<Group>(null)
  const field = useRef<InstancedMesh>(null)
  const horizon = useRef<Mesh>(null)
  const dust = useRef<Points>(null)
  const quality = useJourney((s) => s.quality)
  const { positions, colors } = useDust()

  const count = BEAM_COUNTS[quality]

  // Geometry carries the per-instance seeds, so it is rebuilt with the count.
  const geometry = useMemo(() => {
    const g = makeCrossQuad()
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random() // phase → dash density + duty
      seeds[i * 4 + 1] = 0.25 + Math.random() * 1.5 // downward drift speed
      seeds[i * 4 + 2] = Math.pow(Math.random(), 2.2) // brightness, skewed dim
      // A white-hot minority; the rest stay in the red family.
      seeds[i * 4 + 3] = Math.random() < 0.12 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.2
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    return g
  }, [count])

  useEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const mesh = field.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const b = scatterBeam()
      dummy.position.set(b.x, b.y, b.z)
      dummy.rotation.set(0, b.rotY, b.rotZ)
      dummy.scale.set(b.width, b.len, b.width)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, geometry])

  useFrame((state) => {
    const p = getProgress()
    const { reducedMotion } = useJourney.getState()
    const swell = actWindow(p, CONTACT_FROM, CONTACT_TO)
    // Reduced motion: the field still lives, the dashes just crawl.
    const time = reducedMotion ? state.clock.elapsedTime * 0.2 : state.clock.elapsedTime

    const fade = 1 - ramp(p, FADE_FROM, FADE_TO)

    // Toggle visibility, never unmount — a remount would recompile the shaders
    // mid-scroll and hitch exactly at the pierce.
    const g = group.current
    if (g) g.visible = fade > 0.001

    const fieldMesh = field.current
    if (fieldMesh) {
      const m = fieldMesh.material as LaserUniforms
      m.uTime = time
      m.uBoost = swell
      m.uFade = fade
    }

    const horizonMesh = horizon.current
    if (horizonMesh) {
      const m = horizonMesh.material as LaserUniforms
      m.uTime = time
      m.uBoost = swell
      m.uFade = fade
    }

    const cloud = dust.current
    if (cloud) {
      // Whole-cloud drift: cheaper than touching 800 vertices every frame.
      cloud.rotation.z = time * 0.012
      cloud.position.y = Math.sin(time * 0.13) * 0.4
    }
  })

  return (
    <group ref={group}>
      {/* The field surrounds the camera path; its unit-quad bounds mean three's
          frustum test would cull it wrongly, so it opts out. */}
      <instancedMesh
        ref={field}
        args={[geometry, undefined, count]}
        frustumCulled={false}
        raycast={() => null}
      >
        <laserFieldMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      <mesh ref={horizon} position={[0, HORIZON_Y, HORIZON_Z]} raycast={() => null}>
        <planeGeometry args={[240, 24]} />
        <horizonMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
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
