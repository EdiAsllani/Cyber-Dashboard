import { ROOM } from './constants'
import type { DenMaterials } from './materials'

/**
 * The shell: floor, ceiling, three walls, and the neon trim that reads the
 * room's edges. Boxes rather than planes so the corners actually meet and the
 * dissolve has thickness to eat through.
 *
 * The fourth wall is deliberately missing — the camera arrives through it.
 */
export function DenRoom({ mats }: { mats: DenMaterials }) {
  const { width: W, depth: D, height: H, wall: T } = ROOM

  return (
    <>
      {/* floor / ceiling */}
      <mesh material={mats.shell} position={[0, -T / 2, 0]} receiveShadow>
        <boxGeometry args={[W, T, D]} />
      </mesh>
      <mesh material={mats.shell} position={[0, H + T / 2, 0]}>
        <boxGeometry args={[W, T, D]} />
      </mesh>

      {/* back wall + sides */}
      <mesh material={mats.shell} position={[0, H / 2, -D / 2]}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      <mesh material={mats.shell} position={[-W / 2, H / 2, 0]}>
        <boxGeometry args={[T, H, D]} />
      </mesh>
      <mesh material={mats.shell} position={[W / 2, H / 2, 0]}>
        <boxGeometry args={[T, H, D]} />
      </mesh>

      {/* neon trim: floor-to-wall seams and a ceiling strip */}
      <mesh material={mats.neon} position={[0, 0.06, -D / 2 + 0.14]}>
        <boxGeometry args={[W - 0.4, 0.04, 0.04]} />
      </mesh>
      <mesh material={mats.neon} position={[-W / 2 + 0.14, 0.06, 0]}>
        <boxGeometry args={[0.04, 0.04, D - 0.4]} />
      </mesh>
      <mesh material={mats.neon} position={[W / 2 - 0.14, 0.06, 0]}>
        <boxGeometry args={[0.04, 0.04, D - 0.4]} />
      </mesh>
      <mesh material={mats.neon} position={[0, H - 0.1, -D / 2 + 0.16]}>
        <boxGeometry args={[W - 1.6, 0.05, 0.05]} />
      </mesh>
      <mesh material={mats.neon} position={[-W / 2 + 0.16, H - 0.1, 0]}>
        <boxGeometry args={[0.05, 0.05, D - 1.6]} />
      </mesh>
      <mesh material={mats.neon} position={[W / 2 - 0.16, H - 0.1, 0]}>
        <boxGeometry args={[0.05, 0.05, D - 1.6]} />
      </mesh>
    </>
  )
}
