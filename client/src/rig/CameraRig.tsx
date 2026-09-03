import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getProgress, useJourney, type MonitorSide } from '../state/journey'
import { actWindow } from './acts'
import {
  MONITOR_SIDES,
  ZOOM_STANDOFF,
  screenCenterWorld,
  screenNormal,
} from '../scene/den/constants'
import { useRenderProbe } from '../ui/renderProbe'

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
 *
 * This component is the ONLY writer of the camera in every mode (D-10). The den
 * is a pose machine, not orbit controls.
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
  // t=1 — the seat. Phase 3 pulled this in from z -50 to -51.55 so the screens
  // dominate the frame (~1.5 m of glass instead of ~3). The desk's front edge
  // is at world z -52.55, so this leaves a metre of legroom, and because the
  // curve is uniformly parameterized the shorter final span also slows the
  // arrival down — which is the deceleration the landing wanted anyway.
  new THREE.Vector3(0, 1.34, -51.55),
])

export const LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.6, 2), // stare at the wall
  new THREE.Vector3(0, 1.6, 2),
  new THREE.Vector3(0, 1.6, 0),
  new THREE.Vector3(0, 1.5, -10),
  new THREE.Vector3(0, 1.4, -20),
  new THREE.Vector3(0, 1.6, -34),
  new THREE.Vector3(0, 1.5, -48),
  new THREE.Vector3(0, 1.3, -53.05), // the monitors' midpoint
  new THREE.Vector3(0, 1.3, -53.05),
])

/** Extra per-frame damping on top of ScrollTrigger's scrub. */
const DAMP_LAMBDA = 6
/**
 * Pose-to-pose damping in the den. Lower than the scrub's lambda on purpose:
 * ~4.5 lands the monitor dolly in about 0.8 s, which reads as a deliberate
 * lean-in rather than a snap.
 */
const POSE_LAMBDA = 4.5
/**
 * Reduced motion keeps the transition — moving between two poses is the
 * information, not decoration — but gets there roughly twice as fast.
 */
const POSE_LAMBDA_REDUCED = 10

/** Distance at which the dolly counts as landed and the overlay may fade in. */
const ARRIVE_EPSILON = 0.04

interface DenPose {
  pos: THREE.Vector3
  look: THREE.Vector3
}

/** The seat: where the journey's last control point leaves the camera. */
const SEAT: DenPose = {
  pos: new THREE.Vector3(0, 1.34, -51.55),
  look: new THREE.Vector3(0, 1.3, -53.05),
}

/**
 * A pose per monitor, derived from the shared monitor constants rather than
 * hand-typed, so nudging a screen in the scene moves its zoom pose with it.
 */
function buildZoomPoses(): Record<MonitorSide, DenPose> {
  const out = {} as Record<MonitorSide, DenPose>
  for (const side of MONITOR_SIDES) {
    const look = screenCenterWorld(side)
    const pos = screenNormal(side).multiplyScalar(ZOOM_STANDOFF).add(look)
    out[side] = { pos, look: look.clone() }
  }
  return out
}

export function CameraRig() {
  useRenderProbe('CameraRig')
  const camera = useThree((s) => s.camera)
  const eased = useRef(getProgress())
  const pos = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())

  const zoom = useMemo(buildZoomPoses, [])
  // Live den pose, damped toward the target every frame. Seeded from the curve
  // the first frame the den takes over, so a mode flip at any progress value
  // glides instead of teleporting.
  const denPos = useRef(new THREE.Vector3())
  const denLook = useRef(new THREE.Vector3())
  const denLive = useRef(false)
  const target = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })

  useFrame((state, dt) => {
    const p = getProgress()
    const { mode, reducedMotion, focused, arrived } = useJourney.getState()

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

    const den = mode === 'den' || mode === 'terminal'
    if (!den) {
      denLive.current = false
      camera.position.copy(pos.current)
      camera.lookAt(look.current)
      return
    }

    if (!denLive.current) {
      denLive.current = true
      denPos.current.copy(pos.current)
      denLook.current.copy(look.current)
    }

    const active = mode === 'terminal' && focused ? zoom[focused] : SEAT
    target.current.pos.copy(active.pos)
    target.current.look.copy(active.look)

    // Seat only: a slow breath plus pointer parallax, so the room never feels
    // like a screenshot. Both are folded into the *target* and inherit the
    // pose damping for free. Zoomed at a screen the camera holds dead still.
    if (active === SEAT && !reducedMotion) {
      target.current.pos.x += Math.sin(time * 0.3) * 0.02
      target.current.pos.y += Math.sin(time * 0.23 + 2.0) * 0.015
      // NDC pointer, so ±1 across the viewport.
      const { x: px, y: py } = state.pointer
      target.current.pos.x += px * 0.06
      target.current.pos.y += py * 0.03
      target.current.look.x += px * 0.04
    }

    const lambda = reducedMotion ? POSE_LAMBDA_REDUCED : POSE_LAMBDA
    damp3(denPos.current, target.current.pos, lambda, dt)
    damp3(denLook.current, target.current.look, lambda, dt)

    camera.position.copy(denPos.current)
    camera.lookAt(denLook.current)

    // Arrival is measured, not timed: under a low frame rate a 800 ms timer
    // fires while the dolly is still halfway there.
    if (mode === 'terminal' && !arrived && denPos.current.distanceTo(active.pos) < ARRIVE_EPSILON) {
      useJourney.setState({ arrived: true })
    }
  })

  return null
}

function damp3(current: THREE.Vector3, to: THREE.Vector3, lambda: number, dt: number): void {
  current.x = THREE.MathUtils.damp(current.x, to.x, lambda, dt)
  current.y = THREE.MathUtils.damp(current.y, to.y, lambda, dt)
  current.z = THREE.MathUtils.damp(current.z, to.z, lambda, dt)
}
