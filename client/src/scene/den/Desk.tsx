import type { DenMaterials } from './materials'

/**
 * The workstation. Task 3 of the Phase 3 plan rebuilds this into the real desk
 * (arms, bigger offset monitors, keyboard, mouse, cable tray); this is Phase
 * 2's placeholder slab lifted out of the act file *unchanged*, so the
 * restructure commit stays a pure refactor and its screenshot diff is empty.
 */
export function Desk({ mats }: { mats: DenMaterials }) {
  return (
    <>
      <mesh material={mats.desk} position={[0, 0.72, -0.8]}>
        <boxGeometry args={[2.4, 0.06, 0.8]} />
      </mesh>
      <mesh material={mats.desk} position={[0, 0.36, -0.8]}>
        <boxGeometry args={[2.2, 0.66, 0.06]} />
      </mesh>

      <group position={[-0.34, 1.05, -1.06]} rotation={[0, 0.14, 0]}>
        <mesh material={mats.desk}>
          <boxGeometry args={[0.66, 0.435, 0.04]} />
        </mesh>
        <mesh material={mats.screen} position={[0, 0, 0.025]}>
          <planeGeometry args={[0.6, 0.375]} />
        </mesh>
      </group>
      <group position={[0.34, 1.05, -1.06]} rotation={[0, -0.14, 0]}>
        <mesh material={mats.desk}>
          <boxGeometry args={[0.66, 0.435, 0.04]} />
        </mesh>
        <mesh material={mats.screen} position={[0, 0, 0.025]}>
          <planeGeometry args={[0.6, 0.375]} />
        </mesh>
      </group>
    </>
  )
}
