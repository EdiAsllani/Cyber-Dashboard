import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  armBranch,
  BEZEL_DEPTH,
  BEZEL_PAD,
  DESK,
  DESK_BACK,
  KEYBOARD,
  KEYCAP_COUNT,
  MONITORS,
  MONITOR_SIDES,
  MOUNT,
  MOUSE,
  SCREEN_PROUD,
  type MonitorSpec,
} from './constants'
import { Strut } from './Strut'
import type { DenMaterials } from './materials'
import type { InstancedMesh } from 'three'

/**
 * The workstation: slab, legs, cable tray, two armed monitors, a keyboard and
 * a mouse.
 *
 * Every coordinate comes from `constants.ts` — the camera's zoom poses are
 * derived from the same numbers, so a monitor moved here moves its pose with
 * it and the two can't drift apart.
 *
 * Screen meshes live here for now with a flat emissive material; Task 5 swaps
 * them for the INTERLINKED canvas feed and the click targets.
 */
export function Desk({ mats }: { mats: DenMaterials }) {
  const [tw, tt, td] = DESK.top

  return (
    <>
      {/* slab */}
      <mesh material={mats.desk} position={[0, DESK.y, DESK.z]}>
        <boxGeometry args={[tw, tt, td]} />
      </mesh>
      {/* side slabs as legs, plus a modesty panel across the back */}
      <mesh material={mats.desk} position={[-tw / 2 + 0.03, DESK.y / 2, DESK.z]}>
        <boxGeometry args={[0.06, DESK.y, td - 0.08]} />
      </mesh>
      <mesh material={mats.desk} position={[tw / 2 - 0.03, DESK.y / 2, DESK.z]}>
        <boxGeometry args={[0.06, DESK.y, td - 0.08]} />
      </mesh>
      <mesh material={mats.desk} position={[0, 0.44, DESK_BACK + 0.04]}>
        <boxGeometry args={[tw - 0.16, 0.52, 0.04]} />
      </mesh>
      {/* cable tray under the rear edge — Task 6 hangs a bundle off it */}
      <mesh material={mats.metal} position={[0, DESK.y - 0.11, DESK_BACK + 0.13]}>
        <boxGeometry args={[2.0, 0.1, 0.18]} />
      </mesh>

      <Mount mats={mats} />
      {MONITOR_SIDES.map((side) => (
        <MonitorBody key={side} spec={MONITORS[side]} mats={mats} />
      ))}

      <Keyboard mats={mats} />
      <Mouse mats={mats} />
    </>
  )
}

/**
 * The dual monitor arm: one clamp, one post up the gap between the screens,
 * and a branch per side that disappears behind its own bezel.
 *
 * `Strut` takes two points rather than a position and two angles, which is
 * what keeps this honest — the upper segment ends exactly on the VESA plate
 * because the plate's coordinate is the argument.
 */
function Mount({ mats }: { mats: DenMaterials }) {
  const branches = useMemo(() => MONITOR_SIDES.map((side) => armBranch(side)), [])

  return (
    <group>
      <mesh material={mats.metal} position={MOUNT.clampAt}>
        <boxGeometry args={[0.1, 0.05, 0.16]} />
      </mesh>
      <Strut from={MOUNT.clampAt} to={MOUNT.postTop} radius={0.018} material={mats.metal} />
      {/* A cap on top, so the post reads as engineered rather than cut off. */}
      <mesh material={mats.metal} position={MOUNT.postTop}>
        <cylinderGeometry args={[0.024, 0.024, 0.02, 10]} />
      </mesh>

      {branches.map((arm, i) => (
        <group key={i}>
          <mesh material={mats.metal} position={arm.root}>
            <sphereGeometry args={[0.026, 10, 8]} />
          </mesh>
          <Strut from={arm.root} to={arm.elbow} radius={0.015} material={mats.metal} />
          <mesh material={mats.metal} position={arm.elbow}>
            <sphereGeometry args={[0.022, 10, 8]} />
          </mesh>
          <Strut from={arm.elbow} to={arm.plate} radius={0.014} material={mats.metal} />
          <mesh material={mats.metal} position={arm.plate} rotation={[0, arm.yaw, 0]}>
            <boxGeometry args={[0.1, 0.13, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Bezel plus screen plane, yawed toward the seat. */
function MonitorBody({ spec, mats }: { spec: MonitorSpec; mats: DenMaterials }) {
  const [w, h] = spec.screen
  return (
    <group position={spec.center as unknown as THREE.Vector3Tuple} rotation={[0, spec.yaw, 0]}>
      <mesh material={mats.desk}>
        <boxGeometry args={[w + BEZEL_PAD, h + BEZEL_PAD, BEZEL_DEPTH]} />
      </mesh>
      <mesh material={mats.screen} position={[0, 0, SCREEN_PROUD]}>
        <planeGeometry args={[w, h]} />
      </mesh>
    </group>
  )
}

/**
 * Base plate, one InstancedMesh for all 62 keycaps, and a red underglow strip
 * along the front edge.
 *
 * The caps are instanced rather than 62 meshes for the obvious reason, but also
 * because the layout is then a `useLayoutEffect` writing matrices — which means
 * the row shape is data (`KEYBOARD.rows`) instead of JSX.
 */
function Keyboard({ mats }: { mats: DenMaterials }) {
  const caps = useRef<InstancedMesh>(null)
  const [bw, bh, bd] = KEYBOARD.size

  useLayoutEffect(() => {
    const mesh = caps.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const { rows, colGap, rowGap } = KEYBOARD
    let i = 0
    rows.forEach((count, row) => {
      // Rows run back to front; each is centred on the base.
      const z = (rows.length - 1) / 2 * rowGap - row * rowGap
      const x0 = -((count - 1) / 2) * colGap
      for (let c = 0; c < count; c++) {
        dummy.position.set(x0 + c * colGap, bh / 2 + KEYBOARD.cap / 2, z)
        dummy.updateMatrix()
        mesh.setMatrixAt(i++, dummy.matrix)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [bh])

  return (
    <group position={KEYBOARD.pos} rotation={[0, KEYBOARD.yaw, 0]}>
      <mesh material={mats.desk}>
        <boxGeometry args={[bw, bh, bd]} />
      </mesh>
      <instancedMesh
        ref={caps}
        material={mats.keycap}
        args={[undefined, undefined, KEYCAP_COUNT]}
      >
        <boxGeometry args={[KEYBOARD.cap, KEYBOARD.cap, KEYBOARD.cap]} />
      </instancedMesh>
      {/* Underglow. HDR so bloom catches it — the one bright thing on the desk
          apart from the screens. */}
      <mesh material={mats.underglow} position={[0, -bh * 0.1, bd / 2 + 0.004]}>
        <boxGeometry args={[bw - 0.03, 0.006, 0.006]} />
      </mesh>
    </group>
  )
}

/** Flattened sphere plus a DPI dot. */
function Mouse({ mats }: { mats: DenMaterials }) {
  return (
    <group position={MOUSE.pos}>
      <mesh material={mats.desk} scale={MOUSE.scale as unknown as THREE.Vector3Tuple}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      <mesh material={mats.underglow} position={[0, 0.014, -0.03]}>
        <boxGeometry args={[0.006, 0.002, 0.006]} />
      </mesh>
    </group>
  )
}
