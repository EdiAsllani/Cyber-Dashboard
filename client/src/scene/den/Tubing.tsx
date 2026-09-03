import { useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from './constants'

/**
 * Curved runs: duct elbows and sagging cable bundles.
 *
 * Both are a `TubeGeometry` over a curve; only the curve differs. Keeping them
 * in one file keeps the segment counts (the thing the quality ladder turns
 * down) in one place.
 */

/** Tube segments per tier — cables and elbows are the den's only curved geo. */
export const TUBE_SEGMENTS = { high: 48, medium: 28, low: 16 } as const

/** A 90° elbow: quadratic Bézier through the corner it turns around. */
export function Bend({
  from,
  corner,
  to,
  radius = 0.14,
  segments = 14,
  radial = 10,
  material,
}: {
  from: Vec3
  corner: Vec3
  to: Vec3
  radius?: number
  segments?: number
  radial?: number
  material: THREE.Material
}) {
  const geometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3(...corner),
      new THREE.Vector3(...to),
    )
    return new THREE.TubeGeometry(curve, segments, radius, radial, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], corner[0], corner[1], corner[2], to[0], to[1], to[2], radius, segments, radial])

  return <mesh geometry={geometry} material={material} />
}

/**
 * A cable run. Points are the anchors; the curve between them is Catmull-Rom,
 * so a mid-point dropped below the line between its neighbours reads as a
 * catenary sag without any physics.
 */
export function Cable({
  points,
  radius = 0.012,
  segments = 48,
  radial = 6,
  material,
}: {
  points: readonly Vec3[]
  radius?: number
  segments?: number
  radial?: number
  material: THREE.Material
}) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return new THREE.TubeGeometry(curve, segments, radius, radial, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, radius, segments, radial])

  return <mesh geometry={geometry} material={material} />
}

/**
 * Two anchors plus a sagging middle. `sag` is how far below the straight line
 * the belly of the run hangs.
 */
export function sagged(a: Vec3, b: Vec3, sag: number, bias = 0.5): Vec3[] {
  const from = new THREE.Vector3(...a)
  const to = new THREE.Vector3(...b)
  const mid = from.clone().lerp(to, bias)
  const q1 = from.clone().lerp(to, bias * 0.5)
  const q3 = from.clone().lerp(to, bias + (1 - bias) * 0.5)
  q1.y -= sag * 0.62
  mid.y -= sag
  q3.y -= sag * 0.62
  return [a, [q1.x, q1.y, q1.z], [mid.x, mid.y, mid.z], [q3.x, q3.y, q3.z], b]
}
