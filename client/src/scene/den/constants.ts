import * as THREE from 'three'
import type { MonitorSide } from '../../state/journey'

/**
 * Every coordinate in the den lives here, once.
 *
 * Two consumers must agree on the monitor placement and can never be allowed to
 * drift: the scene builds the screens from it, and the CameraRig derives its
 * zoom poses from it. A monitor nudged in one file and not the other would send
 * the camera into a bezel.
 *
 * Room-local metres unless a name says `world`. World = local + (0, 0, ROOM_Z).
 */

export const ROOM = {
  z: -52,
  width: 10,
  depth: 10,
  height: 3.2,
  /** Shell thickness — walls are boxes, not planes, so corners actually meet. */
  wall: 0.2,
} as const

export const DESK = {
  /** Top slab: 2.8 wide, 6cm thick, 1.0 deep. */
  top: [2.8, 0.06, 1.0] as const,
  y: 0.78,
  /** Slab centre; front edge therefore sits at local z = -0.55 (world -52.55). */
  z: -1.05,
} as const

/**
 * Bigger than Phase 2's 0.6 × 0.375, pushed apart, and the right one rides
 * 0.12 higher than the left (Edi's brief). Inner-edge gap ≈ 0.36 m.
 * `yaw` toes each screen in toward the seat.
 */
export const MONITORS = {
  left: { screen: [0.82, 0.46], center: [-0.56, 1.3, -1.34], yaw: 0.11 },
  right: { screen: [0.74, 0.42], center: [0.58, 1.42, -1.32], yaw: -0.13 },
} as const satisfies Record<MonitorSide, MonitorSpec>

export interface MonitorSpec {
  readonly screen: readonly [number, number]
  readonly center: readonly [number, number, number]
  readonly yaw: number
}

export const MONITOR_SIDES = ['left', 'right'] as const

/** Bezel is the screen plus a 2.5cm frame all round; screen sits 2mm proud. */
export const BEZEL_PAD = 0.05
export const BEZEL_DEPTH = 0.045
export const SCREEN_PROUD = 0.024

/** World-space centre of a screen plane. */
export function screenCenterWorld(side: MonitorSide, out = new THREE.Vector3()): THREE.Vector3 {
  const [x, y, z] = MONITORS[side].center
  return out.set(x, y, z + ROOM.z)
}

/**
 * The screen's outward normal. The plane faces +z inside the monitor group and
 * the group is only ever yawed, so the normal is that yaw on the unit circle.
 */
export function screenNormal(side: MonitorSide, out = new THREE.Vector3()): THREE.Vector3 {
  const { yaw } = MONITORS[side]
  return out.set(Math.sin(yaw), 0, Math.cos(yaw))
}

/** How far in front of the glass the zoom pose parks. */
export const ZOOM_STANDOFF = 0.52
