import { DESK_SURFACE } from './constants'
import type { DenMaterials } from './materials'

/**
 * The stuff on the desk. Two of these are Edi's picks from the game — an
 * Airhypo and Johnny Silverhand's Malorian Arms 3516 — plus mug/shards/paper
 * clutter so the desk reads as used rather than staged.
 *
 * Both game items are primitive *homages*, built from reference images on the
 * Cyberpunk wiki (D-05, and research 02 §5-6 on CDPR's fan-content rules): no
 * ripped meshes, no ripped textures, no logos. At desk scale from 1.5 m away
 * the bar is a recognizable silhouette, not gun-store accuracy.
 *
 * References consulted: the wiki's Malorian entry (an uprated Desert Eagle —
 * long flat-topped slide, deliberately bulky front end with a compensator, a
 * black-and-gold finish) and the Airhypo entry (a compressed-air injector
 * roughly 15 x 7.5 x 4.6 cm with a glass vial).
 */
export function Props({ mats }: { mats: DenMaterials }) {
  return (
    <>
      <Airhypo mats={mats} />
      <Malorian mats={mats} />
      <Mug mats={mats} />
      <Shards mats={mats} />
      <Papers mats={mats} />
    </>
  )
}

/**
 * Pistol-grip injector, dropped on the desk at a lazy angle.
 *
 * Local frame: body along +X, grip down, canister on top. The outer group yaws
 * it, the inner group rolls it about the *body* axis — nested rather than one
 * Euler triple, because a roll around world X would tilt the body out of the
 * desk plane. The roll is 66°, not 90°: flat on its side would hide both the
 * cross and the canister under the body, and those two details are the whole
 * reason it reads as an injector rather than a pen.
 */
function Airhypo({ mats }: { mats: DenMaterials }) {
  const R = 0.012
  return (
    <group position={[-0.62, DESK_SURFACE + 0.019, -0.85]} rotation={[0, 0.9, 0]}>
      <group rotation={[-1.15, 0, 0]}>
        {/* body */}
        <mesh material={mats.gunmetal} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[R, R, 0.09, 14]} />
        </mesh>
        {/* two collars, so the body isn't a bare tube */}
        <mesh
          material={mats.brass}
          position={[-0.026, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[R + 0.003, R + 0.003, 0.006, 14]} />
        </mesh>
        <mesh material={mats.brass} position={[0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[R + 0.002, R + 0.002, 0.005, 14]} />
        </mesh>
        {/* nozzle */}
        <mesh
          material={mats.gunmetal}
          position={[0.058, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <coneGeometry args={[0.009, 0.026, 12]} />
        </mesh>
        {/* grip + trigger */}
        <mesh material={mats.matte} position={[-0.03, -0.022, 0]} rotation={[0, 0, 0.22]}>
          <boxGeometry args={[0.019, 0.042, 0.021]} />
        </mesh>
        <mesh material={mats.gunmetal} position={[-0.012, -0.012, 0]}>
          <boxGeometry args={[0.005, 0.014, 0.008]} />
        </mesh>
        {/* the charge canister, clipped on top */}
        <mesh
          material={mats.vial}
          position={[-0.004, 0.018, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.0085, 0.0085, 0.05, 14]} />
        </mesh>
        <mesh
          material={mats.gunmetal}
          position={[0.023, 0.018, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.0095, 0.0095, 0.006, 12]} />
        </mesh>
        <mesh
          material={mats.gunmetal}
          position={[-0.031, 0.018, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.0095, 0.0095, 0.006, 12]} />
        </mesh>
        {/* medical cross, as two emissive slivers rather than a decal texture */}
        <mesh material={mats.underglow} position={[0.006, 0.0, 0.0125]}>
          <boxGeometry args={[0.014, 0.004, 0.001]} />
        </mesh>
        <mesh material={mats.underglow} position={[0.006, 0.0, 0.0125]}>
          <boxGeometry args={[0.004, 0.014, 0.001]} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Malorian Arms 3516. Local frame: barrel +X, gun-up +Y, thickness ±Z.
 *
 * The outer group yaws the barrel; the inner group rolls the gun onto its side
 * (thickness becomes vertical), which puts the *profile* face up — and the
 * profile is the only view that sells this silhouette from a seated camera
 * looking down at the desk.
 *
 * Muzzle points away from the seat, which is both good manners and the reason
 * the yaw is what it is.
 */
function Malorian({ mats }: { mats: DenMaterials }) {
  const HALF_THICK = 0.019
  return (
    <group
      position={[0.86, DESK_SURFACE + HALF_THICK, -0.95]}
      rotation={[0, Math.PI / 2 - 0.32, 0]}
    >
      <group rotation={[Math.PI / 2, 0, 0]}>
        {/* slide — long and flat-topped, the defining line of the gun */}
        <mesh material={mats.gunmetal} position={[0.035, 0.03, 0]}>
          <boxGeometry args={[0.19, 0.03, 0.032]} />
        </mesh>
        <mesh material={mats.gunmetal} position={[0.03, 0.048, 0]}>
          <boxGeometry args={[0.16, 0.007, 0.014]} />
        </mesh>
        {/* frame + dust cover */}
        <mesh material={mats.matte} position={[0, 0.01, 0]}>
          <boxGeometry args={[0.13, 0.02, 0.03]} />
        </mesh>
        <mesh material={mats.gunmetal} position={[0.06, 0.0, 0]}>
          <boxGeometry args={[0.09, 0.011, 0.026]} />
        </mesh>

        {/* the signature front end: a deliberately over-built compensator */}
        <mesh material={mats.gunmetal} position={[0.152, 0.03, 0]}>
          <boxGeometry args={[0.05, 0.042, 0.038]} />
        </mesh>
        {[0.14, 0.152, 0.164].map((x) => (
          <mesh key={x} material={mats.matte} position={[x, 0.051, 0]}>
            <boxGeometry args={[0.006, 0.008, 0.04]} />
          </mesh>
        ))}
        <mesh material={mats.brass} position={[0.176, 0.03, 0]}>
          <boxGeometry args={[0.006, 0.03, 0.036]} />
        </mesh>
        <mesh
          material={mats.matte}
          position={[0.181, 0.03, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.008, 0.008, 0.012, 12]} />
        </mesh>

        {/* skeletal grip: two straps with the spine exposed between them */}
        <mesh material={mats.matte} position={[-0.062, -0.014, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.024, 0.062, 0.028]} />
        </mesh>
        <mesh material={mats.gunmetal} position={[-0.094, -0.01, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.013, 0.066, 0.026]} />
        </mesh>
        <mesh material={mats.brass} position={[-0.08, -0.046, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.032, 0.009, 0.026]} />
        </mesh>

        {/* trigger guard + trigger */}
        <mesh
          material={mats.gunmetal}
          position={[-0.03, -0.012, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 0.75, 1]}
        >
          <torusGeometry args={[0.019, 0.004, 6, 16, Math.PI]} />
        </mesh>
        <mesh material={mats.gunmetal} position={[-0.03, -0.003, 0]}>
          <boxGeometry args={[0.005, 0.016, 0.008]} />
        </mesh>

        {/* rear sight and the two actuator prongs off the back of the slide */}
        <mesh material={mats.gunmetal} position={[-0.04, 0.05, 0]}>
          <boxGeometry args={[0.011, 0.008, 0.026]} />
        </mesh>
        {[0.009, -0.009].map((z) => (
          <mesh
            key={z}
            material={mats.gunmetal}
            position={[-0.058, 0.045, z]}
            rotation={[0, 0, 0.32]}
          >
            <boxGeometry args={[0.026, 0.007, 0.009]} />
          </mesh>
        ))}

        {/* One hot seam along the slide — the only thing on this prop bloom is
            allowed to notice. It has to sit on the -Z face: the inner group
            rolls the gun onto its side, and Rx(90°) maps -Z to +Y, so -Z is
            the face that ends up looking at the ceiling. */}
        <mesh material={mats.underglow} position={[0.03, 0.036, -0.0165]}>
          <boxGeometry args={[0.13, 0.004, 0.002]} />
        </mesh>
      </group>
    </group>
  )
}

/** Open cylinder + torus handle + a disc of cold coffee. */
function Mug({ mats }: { mats: DenMaterials }) {
  return (
    <group position={[-1.12, DESK_SURFACE, -1.3]}>
      <mesh material={mats.matte} position={[0, 0.042, 0]}>
        <cylinderGeometry args={[0.037, 0.032, 0.085, 18, 1, true]} />
      </mesh>
      <mesh material={mats.matte} position={[0, 0.001, 0]}>
        <cylinderGeometry args={[0.032, 0.032, 0.003, 18]} />
      </mesh>
      <mesh material={mats.matte} position={[0, 0.068, 0]}>
        <cylinderGeometry args={[0.033, 0.033, 0.002, 18]} />
      </mesh>
      <mesh
        material={mats.matte}
        position={[0.04, 0.045, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.018, 0.005, 6, 14]} />
      </mesh>
    </group>
  )
}

/** A leaning stack of shards. One still has power. */
function Shards({ mats }: { mats: DenMaterials }) {
  const stack = [
    { pos: [0, 0.0015, 0] as const, rot: 0.15 },
    { pos: [0.008, 0.0045, 0.004] as const, rot: -0.08 },
    { pos: [-0.006, 0.0075, -0.006] as const, rot: 0.34 },
  ]
  return (
    <group position={[1.16, DESK_SURFACE, -1.28]}>
      {stack.map((s, i) => (
        <group key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <mesh material={mats.matte}>
            <boxGeometry args={[0.058, 0.003, 0.086]} />
          </mesh>
          {i === 2 && (
            <mesh material={mats.underglow} position={[0.028, 0.0005, 0]}>
              <boxGeometry args={[0.003, 0.0035, 0.07]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

/** Two loose printouts. Planes, so they cost two triangles each. */
function Papers({ mats }: { mats: DenMaterials }) {
  return (
    <>
      <mesh
        material={mats.matte}
        position={[-1.03, DESK_SURFACE + 0.0012, -0.68]}
        rotation={[-Math.PI / 2, 0, 0.26]}
      >
        <planeGeometry args={[0.15, 0.2]} />
      </mesh>
      <mesh
        material={mats.matte}
        position={[1.13, DESK_SURFACE + 0.0018, -0.66]}
        rotation={[-Math.PI / 2, 0, -0.12]}
      >
        <planeGeometry args={[0.14, 0.19]} />
      </mesh>
    </>
  )
}
