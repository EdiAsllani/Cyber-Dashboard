import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney } from '../state/journey'
import { actWindow } from './acts'

/**
 * The dive. One Catmull-Rom curve for position, a second for the look target,
 * both sampled by scroll progress.
 *
 * Sampling is deliberately `getPoint` (uniform), not `getPointAt` (arc length):
 * uniform parameterization puts control point k at exactly t = k/8, which lands
 * the staged milestones on the act boundaries (wall reached at 0.25, pierced at
 * ~0.37, tunnel exit at 0.75, den threshold at 0.85). Arc length would drag the
 * pierce forward to t ≈ 0.31 and leave the tunnel still running at 0.85. The
 * side effect is a speed profile that follows control-point spacing — a brisk
 * approach, a hover at the wall, a fast tunnel, a decelerating arrival — which
 * is what the journey wants anyway.
 *
 * Landmarks: the Blackwall plane sits at z = 2, the tunnel spans z ∈ [-2, -44],
 * the den is centered on z = -52.
 */
export const PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.6, 26), // t=0    far void
  new THREE.Vector3(0.6, 1.7, 14), //       drift in
  new THREE.Vector3(0, 1.6, 6), // ~0.25    close to the wall
  new THREE.Vector3(0, 1.6, 1.0), // ~0.40  piercing it
  new THREE.Vector3(1.2, 1.2, -12), //      tunnel wobble
  new THREE.Vector3(-1.2, 2.0, -26), //     tunnel wobble
  new THREE.Vector3(0, 1.6, -40), // ~0.70  tunnel exit
  new THREE.Vector3(0, 1.5, -47), // ~0.85  room threshold
  new THREE.Vector3(0, 1.4, -50), // t=1    desk height, in the den
])

export const LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.6, 2), // stare at the wall
  new THREE.Vector3(0, 1.6, 2),
  new THREE.Vector3(0, 1.6, 0),
  new THREE.Vector3(0, 1.5, -10),
  new THREE.Vector3(0, 1.4, -20),
  new THREE.Vector3(0, 1.6, -34),
  new THREE.Vector3(0, 1.5, -48),
  new THREE.Vector3(0, 1.35, -52.5), // the (future) desk
  new THREE.Vector3(0, 1.35, -52.5),
])

/** Extra per-frame damping on top of ScrollTrigger's scrub. */
const DAMP_LAMBDA = 6

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const eased = useRef(getProgress())
  const pos = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())

  useFrame((state, dt) => {
    const p = getProgress()
    const { mode, reducedMotion } = useJourney.getState()

    // Reduced motion gets the raw scrub — no inertia anywhere in the chain.
    eased.current = reducedMotion
      ? p
      : THREE.MathUtils.damp(eased.current, p, DAMP_LAMBDA, dt)
    const t = THREE.MathUtils.clamp(eased.current, 0, 1)

    PATH.getPoint(t, pos.current)
    LOOK.getPoint(t, look.current)

    const time = state.clock.elapsedTime

    // Act 2 contact shake: incommensurate sines read as noise but stay
    // deterministic, so a paused frame looks the same every time.
    const shake = reducedMotion ? 0 : actWindow(p, 0.3, 0.42) * 0.06
    if (shake > 0) {
      pos.current.x += Math.sin(time * 47.0) * shake
      pos.current.y += Math.sin(time * 31.7 + 1.3) * shake
      pos.current.z += Math.sin(time * 61.1 + 2.1) * shake * 0.4
    }

    // In the den the rig stops driving and only breathes (Phase 3 hands the
    // camera to CameraControls here).
    if (mode === 'den' && !reducedMotion) {
      pos.current.x += Math.sin(time * 0.3) * 0.02
      pos.current.y += Math.sin(time * 0.23 + 2.0) * 0.015
    }

    camera.position.copy(pos.current)
    camera.lookAt(look.current)
  })

  return null
}
