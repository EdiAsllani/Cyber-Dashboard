import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress } from '../state/journey'
import { ramp } from '../rig/acts'
import { Act1Blackwall } from './acts/Act1Blackwall'
import { Act3Tunnel } from './acts/Act3Tunnel'
import { Act5DenShell } from './acts/Act5DenShell'
import type { Fog } from 'three'

/**
 * Mounts every act for the whole journey and leaves them mounted. Acts own
 * their own visibility window (driven from progress inside useFrame) so no
 * material is ever recompiled mid-scroll.
 */

const FOG_COLOR = '#050505'
/** Effectively off: nothing in acts 1-2 is more than ~80 units out. */
const FOG_OPEN = { near: 60, far: 400 }
/** Closed in, so the tunnel has no visible end and the room emerges from it. */
const FOG_TIGHT = { near: 4, far: 34 }

export function JourneyScene() {
  const fog = useRef<Fog>(null)

  useFrame(() => {
    const f = ramp(getProgress(), 0.38, 0.48)
    const node = fog.current
    if (!node) return
    node.near = THREE.MathUtils.lerp(FOG_OPEN.near, FOG_TIGHT.near, f)
    node.far = THREE.MathUtils.lerp(FOG_OPEN.far, FOG_TIGHT.far, f)
  })

  return (
    <>
      {/* Fog is mounted for the entire journey and animated instead of being
          attached at the tunnel boundary: adding fog to the scene flips the FOG
          shader define and would recompile every fogged material mid-dive. */}
      <fog ref={fog} attach="fog" args={[FOG_COLOR, FOG_OPEN.near, FOG_OPEN.far]} />
      <Act1Blackwall />
      <Act3Tunnel />
      <Act5DenShell />
    </>
  )
}
