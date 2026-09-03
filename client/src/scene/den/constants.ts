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

export type Vec3 = readonly [number, number, number]

export const DESK = {
  /** Top slab: 2.8 wide, 6cm thick, 1.0 deep. */
  top: [2.8, 0.06, 1.0] as const,
  /** Slab *centre* height. */
  y: 0.78,
  /** Slab centre; front edge therefore sits at local z = -0.55 (world -52.55). */
  z: -1.05,
} as const

/**
 * The working surface — where anything standing on the desk actually sits.
 * Derived, never typed: `DESK.y` is the slab's centre, so props placed at
 * `DESK.y` would be sunk halfway into it.
 */
export const DESK_SURFACE = DESK.y + DESK.top[1] / 2 // 0.81
export const DESK_FRONT = DESK.z + DESK.top[2] / 2 // -0.55
export const DESK_BACK = DESK.z - DESK.top[2] / 2 // -1.55

export const KEYBOARD = {
  /** Base plate. Caps sit on top of it, not in it. */
  size: [0.44, 0.018, 0.15] as const,
  pos: [-0.12, DESK_SURFACE + 0.009, -0.72] as Vec3,
  yaw: 0.05,
  /** 5 rows, 62 caps, one InstancedMesh. */
  rows: [13, 13, 13, 12, 11] as const,
  cap: 0.016,
  colGap: 0.03,
  rowGap: 0.026,
} as const

export const KEYCAP_COUNT = KEYBOARD.rows.reduce((n, r) => n + r, 0)

export const MOUSE = {
  /** A squashed sphere reads as a mouse shell at this scale. */
  scale: [0.03, 0.018, 0.055] as Vec3,
  pos: [0.28, DESK_SURFACE + 0.018, -0.7] as Vec3,
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

/**
 * The mount, as a joint chain rather than positions-and-angles.
 *
 * A dual-arm on one central post, clamped to the desk's rear edge in the 0.36m
 * gap between the screens. That placement is the whole reason it reads: an
 * arm mounted behind a monitor is, by construction, hidden behind that monitor
 * from the seat — the post in the gap is the one part of the mount the camera
 * looks straight at, and the two branches leaving it at different heights are
 * what show that the right screen rides higher.
 *
 * Each branch terminates on the VESA plate behind its bezel, so the arm cannot
 * float away from the screen it is holding.
 */
export const MOUNT = {
  clampAt: [0.03, DESK_SURFACE + 0.025, DESK_BACK + 0.06] as Vec3,
  postTop: [0.03, 1.72, DESK_BACK + 0.06] as Vec3,
  /** Where the branches leave the post, per side. */
  branchDrop: 0.06,
} as const

export interface ArmBranch {
  root: Vec3
  elbow: Vec3
  plate: Vec3
  /** Yaw of the plate, matching its screen. */
  yaw: number
}

export function armBranch(side: MonitorSide): ArmBranch {
  const { center, yaw } = MONITORS[side]
  const [cx, cy, cz] = center
  const dir = cx < 0 ? -1 : 1
  const [px, , pz] = MOUNT.postTop
  return {
    root: [px, cy + MOUNT.branchDrop, pz],
    elbow: [px + dir * 0.11, cy + MOUNT.branchDrop * 0.5, pz + 0.05],
    plate: [cx * 0.99, cy, cz - BEZEL_DEPTH / 2 - 0.012],
    yaw,
  }
}
