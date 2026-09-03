import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress } from '../state/journey'
import { ramp } from '../rig/acts'
import { Act1Blackwall } from './acts/Act1Blackwall'
import { Act3Tunnel } from './acts/Act3Tunnel'
import { Act5DenShell } from './acts/Act5DenShell'
import { useRenderProbe } from '../ui/renderProbe'
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
/**
 * Opened back up for the den. The tunnel's fog is tight enough to swallow the
 * back wall of a 10m room — the decoration on it would read as a grey smear —
 * but it can only be relaxed *after* the dissolve has covered the tunnel exit,
 * hence a second ramp rather than a wider first one.
 */
const FOG_ROOM = { near: 10, far: 80 }

export function JourneyScene() {
  useRenderProbe('JourneyScene')
  const fog = useRef<Fog>(null)

  useFrame(() => {
    const p = getProgress()
    const node = fog.current
    if (!node) return
    // Two ramps on one fog node: open → tight for the tunnel, then tight →
    // room once the den has materialized. Nesting the lerps keeps a single
    // pair of writes, and the second ramp starting at 0.85 means it only ever
    // acts on the already-tightened values.
    const tunnel = ramp(p, 0.38, 0.48)
    const room = ramp(p, 0.85, 0.97)
    node.near = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(FOG_OPEN.near, FOG_TIGHT.near, tunnel),
      FOG_ROOM.near,
      room,
    )
    node.far = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(FOG_OPEN.far, FOG_TIGHT.far, tunnel),
      FOG_ROOM.far,
      room,
    )
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
