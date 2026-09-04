import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ROOM, type Vec3 } from './constants'
import { Bend, Cable, sagged, TUBE_SEGMENTS } from './Tubing'
import type { DenMaterials } from './materials'
import type { Quality } from '../../state/journey'
import type { InstancedMesh } from 'three'

/**
 * Everything that makes the shell read as an office rather than a box:
 * ceiling ducting, cable runs on the walls, a server rack, two posters.
 *
 * All of it is emissive-or-lit-by-the-existing-two-lamps. Nothing here mounts
 * a light: three keys shader programs on the visible light count, so a light
 * added after t=0 recompiles every standard material in the scene.
 *
 * Repeated small parts (duct brackets, cable clips, rack LEDs) are instanced.
 * Not for triangles — for draw calls: the den's budget is under 160 and a
 * dozen separate bracket meshes is a dozen of them.
 */

const INNER = ROOM.width / 2 - ROOM.wall / 2 // 4.9 — inner face of a side wall
const BACK = -ROOM.depth / 2 + ROOM.wall / 2 // -4.9
const CEIL = ROOM.height // 3.2

/** Duct A runs left-right across the room; duct B runs front-back. */
const DUCT_A = { y: 2.95, z: -3.2, from: -4.3, to: 4.3, r: 0.14 }
const DUCT_B = { y: 2.82, x: 2.6, from: -4.3, to: 4.1, r: 0.12 }

const BRACKETS: Vec3[] = [
  [-3.4, 0, DUCT_A.z],
  [-1.9, 0, DUCT_A.z],
  [-0.4, 0, DUCT_A.z],
  [1.1, 0, DUCT_A.z],
  [2.6, 0, DUCT_A.z],
  [4.0, 0, DUCT_A.z],
  [DUCT_B.x, 0, -3.6],
  [DUCT_B.x, 0, -2.1],
  [DUCT_B.x, 0, -0.6],
  [DUCT_B.x, 0, 0.9],
  [DUCT_B.x, 0, 2.4],
  [DUCT_B.x, 0, 3.8],
]

export function Decor({
  mats,
  quality,
  leds,
}: {
  mats: DenMaterials
  quality: Quality
  leds: React.RefObject<InstancedMesh | null>
}) {
  const seg = TUBE_SEGMENTS[quality]

  return (
    <>
      <Vents mats={mats} segments={seg} />
      <WallWires mats={mats} segments={seg} />
      <ServerRack mats={mats} quality={quality} leds={leds} />
      <Posters mats={mats} />
    </>
  )
}

function Vents({ mats, segments }: { mats: DenMaterials; segments: number }) {
  const { y: ay, z: az, r: ar } = DUCT_A
  const { y: by, x: bx, r: br } = DUCT_B
  // Straight runs are cylinders and don't care about the tier; the elbows are
  // tube geometry and do.
  const bendSeg = Math.max(5, Math.round(segments / 3))
  const aLen = DUCT_A.to - DUCT_A.from
  const bLen = DUCT_B.to - DUCT_B.from

  return (
    <>
      {/* Duct A, along X, with an elbow dropping toward the right wall. */}
      <mesh
        material={mats.metal}
        position={[(DUCT_A.from + DUCT_A.to) / 2, ay, az]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[ar, ar, aLen, 14, 1]} />
      </mesh>
      <Bend
        from={[DUCT_A.to, ay, az]}
        corner={[DUCT_A.to + 0.32, ay, az]}
        to={[DUCT_A.to + 0.32, ay - 0.42, az]}
        radius={ar}
        segments={bendSeg}
        material={mats.metal}
      />
      {/* A flange where the drop enters the bulkhead. */}
      <mesh material={mats.metal} position={[DUCT_A.to + 0.32, ay - 0.44, az]}>
        <cylinderGeometry args={[ar + 0.03, ar + 0.03, 0.04, 14]} />
      </mesh>

      {/* Duct B, along Z, at a different height so the two cross rather than
          meet — ceilings are never tidy. */}
      <mesh
        material={mats.metal}
        position={[bx, by, (DUCT_B.from + DUCT_B.to) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[br, br, bLen, 12, 1]} />
      </mesh>
      <Bend
        from={[bx, by, DUCT_B.from]}
        corner={[bx, by, DUCT_B.from - 0.3]}
        to={[bx, by - 0.4, DUCT_B.from - 0.3]}
        radius={br}
        segments={bendSeg}
        material={mats.metal}
      />

      {/* Hangers: one instanced strap per bracket position. */}
      <Brackets mats={mats} />

      {/* One square diffuser, slung under duct A over the desk. */}
      <group position={[-1.4, DUCT_A.y - 0.19, DUCT_A.z]}>
        <mesh material={mats.metal}>
          <boxGeometry args={[0.36, 0.14, 0.36]} />
        </mesh>
        {[-0.1, 0, 0.1].map((z) => (
          <mesh key={z} material={mats.shell} position={[0, -0.072, z]}>
            <boxGeometry args={[0.3, 0.012, 0.05]} />
          </mesh>
        ))}
      </group>
    </>
  )
}

function Brackets({ mats }: { mats: DenMaterials }) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    BRACKETS.forEach((p, i) => {
      const duct = p[0] === DUCT_B.x && p[2] !== DUCT_A.z ? DUCT_B : DUCT_A
      const top = CEIL
      const bottom = duct.y + duct.r - 0.01
      dummy.position.set(p[0], (top + bottom) / 2, p[2])
      dummy.scale.set(1, Math.max(top - bottom, 0.02) / 0.1, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [])

  return (
    <instancedMesh ref={mesh} material={mats.metal} args={[undefined, undefined, BRACKETS.length]}>
      {/* Unit height 0.1, scaled per instance — one geometry, twelve straps. */}
      <boxGeometry args={[0.035, 0.1, 0.02]} />
    </instancedMesh>
  )
}

/**
 * Cable runs. Five spans on the walls plus the bundle that leaves the desk's
 * cable tray, drops to the floor and follows the baseboard.
 *
 * One run uses the hot material and is pulsed from the act's useFrame — no
 * component in the den owns a frame loop of its own.
 */
function WallWires({ mats, segments }: { mats: DenMaterials; segments: number }) {
  const runs = useMemo(
    () => [
      { points: sagged([-4.7, 2.45, BACK + 0.05], [-0.6, 2.55, BACK + 0.05], 0.34), r: 0.012 },
      { points: sagged([-4.6, 2.05, BACK + 0.05], [-1.2, 2.2, BACK + 0.05], 0.26), r: 0.009 },
      { points: sagged([-INNER + 0.05, 2.6, -3.0], [-INNER + 0.05, 2.3, 1.4], 0.4), r: 0.011 },
      { points: sagged([INNER - 0.05, 2.5, -2.0], [INNER - 0.05, 2.72, 2.2], 0.3), r: 0.013 },
      {
        // Tray → floor → baseboard. Not a sag: a real drop with a bend at the
        // floor, so the run explains where the desk's power goes.
        points: [
          [0.62, 0.66, -1.42],
          [0.72, 0.42, -1.7],
          [0.88, 0.06, -2.3],
          [1.4, 0.05, -3.4],
          [2.1, 0.045, -4.6],
        ] as Vec3[],
        r: 0.015,
      },
    ],
    [],
  )

  const hot = useMemo(
    () => sagged([0.4, 2.3, BACK + 0.05], [4.7, 2.5, BACK + 0.05], 0.42),
    [],
  )

  return (
    <>
      {runs.map((run, i) => (
        <Cable
          key={i}
          points={run.points}
          radius={run.r}
          segments={segments}
          material={mats.metal}
        />
      ))}
      {/* The one live cable. Pulsed in the act. */}
      <Cable points={hot} radius={0.014} segments={segments} material={mats.cableHot} />
      <Clips mats={mats} runs={[...runs.map((r) => r.points), hot]} />
    </>
  )
}

/** A clip at every run's endpoints. Instanced — twelve clips, one draw call. */
function Clips({ mats, runs }: { mats: DenMaterials; runs: Vec3[][] }) {
  const mesh = useRef<InstancedMesh>(null)
  const anchors = useMemo(() => runs.flatMap((p) => [p[0], p[p.length - 1]]), [runs])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    anchors.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2])
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [anchors])

  return (
    <instancedMesh ref={mesh} material={mats.metal} args={[undefined, undefined, anchors.length]}>
      <boxGeometry args={[0.05, 0.05, 0.04]} />
    </instancedMesh>
  )
}

/** LED studs per tier. The array is allocated at the max so a tier change
 *  only moves `count` and never reallocates. */
export const RACK_LEDS: Record<Quality, number> = { high: 72, medium: 48, low: 24 }
const RACK_LED_MAX = 72
const RACK_POS: Vec3 = [-4.0, 0, -3.8]
const RACK = { w: 0.6, h: 1.9, d: 0.7 }

function ServerRack({
  mats,
  quality,
  leds,
}: {
  mats: DenMaterials
  quality: Quality
  leds: React.RefObject<InstancedMesh | null>
}) {
  const faces = [0.35, 0.68, 1.01, 1.34, 1.67]

  useLayoutEffect(() => {
    const m = leds.current
    if (!m) return
    const dummy = new THREE.Object3D()
    // Six studs per row, twelve rows, filling the cabinet's front face.
    for (let i = 0; i < RACK_LED_MAX; i++) {
      const row = Math.floor(i / 6)
      const col = i % 6
      dummy.position.set(-0.2 + col * 0.08, 0.3 + row * 0.12, RACK.d / 2 + 0.012)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // 85% red family, 15% cyan — the same accent ratio as the tunnel.
      // Cyan studs start lit; a third of the reds do.
      m.setColorAt(i, ledColor(i, i % 7 === 3 || i % 3 === 0))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [leds])

  return (
    <group position={RACK_POS}>
      <mesh material={mats.desk} position={[0, RACK.h / 2, 0]}>
        <boxGeometry args={[RACK.w, RACK.h, RACK.d]} />
      </mesh>
      {faces.map((y) => (
        <mesh key={y} material={mats.metal} position={[0, y, RACK.d / 2 + 0.005]}>
          <boxGeometry args={[RACK.w - 0.08, 0.26, 0.02]} />
        </mesh>
      ))}
      {/* Basic material, not standard: these are 4mm studs read as pure light,
          and `vertexColors` must stay OFF despite the per-instance colours —
          three defines USE_COLOR in the fragment prefix from instanceColor
          alone, while the vertex prefix takes it from material.vertexColors,
          so enabling it makes the vertex shader read a `color` attribute this
          geometry doesn't have and every stud renders black. */}
      <instancedMesh
        ref={leds}
        args={[undefined, undefined, RACK_LED_MAX]}
        count={RACK_LEDS[quality]}
      >
        <boxGeometry args={[0.014, 0.014, 0.006]} />
        <meshBasicMaterial toneMapped={false} fog={false} />
      </instancedMesh>
    </group>
  )
}

const LED_RED = new THREE.Color(1.6, 0.02, 0.12)
const LED_DIM = new THREE.Color(0.5, 0.01, 0.05)
const LED_CYAN = new THREE.Color(0.04, 1.1, 1.4)
const LED_CYAN_DIM = new THREE.Color(0.015, 0.32, 0.42)

/**
 * A stud's colour, given whether it is currently lit. Index decides the family
 * (the same 85/15 red/cyan split as the initial layout), so the act's blink can
 * flip brightness without ever turning a cyan stud red.
 */
export function ledColor(i: number, lit: boolean): THREE.Color {
  if (i % 7 === 3) return lit ? LED_CYAN : LED_CYAN_DIM
  return lit ? LED_RED : LED_DIM
}

/**
 * Two posters. No imagery: a dark panel over a slightly larger emissive one,
 * which reads as a lit frame at this distance and costs two draw calls instead
 * of a plane plus four border strips.
 */
function Posters({ mats }: { mats: DenMaterials }) {
  return (
    <>
      {/* Clear of the left wall's sign: the plate of WE HAVE A CITY TO BURN
          spans z -1.89..0.09, and the poster sat in front of its copy. */}
      <group position={[-INNER + 0.03, 1.75, 0.9]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={mats.underglow}>
          <planeGeometry args={[0.78, 1.08]} />
        </mesh>
        <mesh material={mats.shell} position={[0, 0, 0.004]}>
          <planeGeometry args={[0.74, 1.04]} />
        </mesh>
      </group>
      <group position={[INNER - 0.03, 1.7, 1.2]} rotation={[0, -Math.PI / 2, 0.03]}>
        <mesh material={mats.underglow}>
          <planeGeometry args={[0.66, 0.92]} />
        </mesh>
        <mesh material={mats.shell} position={[0, 0, 0.004]}>
          <planeGeometry args={[0.62, 0.88]} />
        </mesh>
      </group>
    </>
  )
}
