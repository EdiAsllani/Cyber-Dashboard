import { useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from './constants'

/**
 * A cylinder that runs between two points.
 *
 * Every armature in the den (monitor arms, brackets, duct hangers) is easier to
 * *specify* as "a rod from this joint to that joint" than as a position plus
 * two Euler angles, and specifying it that way is also what keeps the geometry
 * honest — the arm terminates exactly at the VESA plate because the plate's
 * coordinate is the argument.
 *
 * CylinderGeometry runs along +Y, so the quaternion is the rotation that takes
 * +Y onto the segment's direction.
 */
export function Strut({
  from,
  to,
  radius = 0.018,
  segments = 8,
  material,
}: {
  from: Vec3
  to: Vec3
  radius?: number
  segments?: number
  material: THREE.Material
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const q = new THREE.Quaternion().setFromUnitVectors(
      UP,
      len > 1e-6 ? dir.clone().divideScalar(len) : UP,
    )
    return { position: a.add(b).multiplyScalar(0.5), quaternion: q, length: len }
  }, [from, to])

  return (
    <mesh material={material} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, segments, 1]} />
    </mesh>
  )
}

const UP = new THREE.Vector3(0, 1, 0)
