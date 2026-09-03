import { useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { ROOM, type Vec3 } from './constants'
import type { DenMaterials } from './materials'

/**
 * Wall-mounted neon quote signs, per Edi's brief. `TIME TO GO KLEPPING` is
 * required; the rest are short lines from the game's world.
 *
 * Short quotes on props only — this is a non-commercial fan work (see the
 * README disclaimer and research 02 §5-6), so no logos and no logotypes.
 *
 * Two things about troika (drei's `Text`) matter here:
 *
 * 1. It needs a real font *file* URL. It cannot use the Google Fonts CSS the
 *    DOM side of the app loads, hence `public/fonts/*.ttf` (both SIL OFL,
 *    licences committed alongside).
 * 2. Its material cannot take the `createDissolveMaterial` patch, so the signs
 *    can't burn in with the walls. They fade instead, driven from the same
 *    `reveal` value — which reads fine next to a dissolve.
 */

const RAJDHANI = '/fonts/Rajdhani-SemiBold.ttf'

const BACK = -ROOM.depth / 2 + ROOM.wall / 2 + 0.03
const INNER = ROOM.width / 2 - ROOM.wall / 2 - 0.03

/** HDR neon: above 1.0 so bloom, and only bloom, picks the tubes up. */
const NEON_PINK = new THREE.Color(2.6, 0.05, 0.6)
const NEON_RED = new THREE.Color(2.4, 0.08, 0.22)
const TUBE_DIM = new THREE.Color(0.5, 0.02, 0.12)

interface SignSpec {
  text: string
  position: Vec3
  rotation: Vec3
  size: number
  /** Backing plate, sized to the copy. */
  plate: readonly [number, number]
  color: THREE.Color
  /** One sign is on a flicker lottery. */
  flickers: boolean
}

const SIGNS: readonly SignSpec[] = [
  {
    // Required, verbatim.
    text: 'TIME TO GO KLEPPING',
    position: [0, 2.42, BACK],
    rotation: [0, 0, 0],
    size: 0.23,
    plate: [2.36, 0.44],
    color: NEON_PINK,
    flickers: true,
  },
  {
    text: 'WE HAVE A CITY TO BURN',
    position: [-INNER, 2.12, -0.9],
    rotation: [0, Math.PI / 2, 0],
    size: 0.17,
    plate: [1.98, 0.34],
    color: NEON_RED,
    flickers: false,
  },
  {
    // The graffiti-style odd one out — hung a few degrees off true.
    text: 'NO FUTURE',
    position: [INNER, 1.94, -0.4],
    rotation: [0, -Math.PI / 2, -0.045],
    size: 0.19,
    plate: [1.02, 0.36],
    color: NEON_PINK,
    flickers: false,
  },
]

/** Troika's mesh, as much of it as this file touches. */
interface TroikaText {
  fillOpacity: number
  outlineOpacity: number
}

export interface NeonSigns {
  refs: React.RefObject<(TroikaText | null)[]>
  /**
   * Fade the signs with the room and run the flicker lottery. Called from the
   * act's single useFrame — no component in the den owns a frame loop.
   */
  tick(reveal: number, now: number, reducedMotion: boolean): void
}

export function useNeonSigns(): NeonSigns {
  const refs = useRef<(TroikaText | null)[]>([])

  return useMemo<NeonSigns>(
    () => ({
      refs,
      tick(reveal, now, reducedMotion) {
        for (let i = 0; i < SIGNS.length; i++) {
          const sign = refs.current[i]
          if (!sign) continue
          // A failing tube: three frames out of a 13Hz grid, so it reads as a
          // bad contact rather than a strobe.
          const dying =
            !reducedMotion && SIGNS[i].flickers && hash(Math.floor(now * 13)) > 0.93 ? 0.35 : 1
          sign.fillOpacity = reveal * dying
          sign.outlineOpacity = reveal * dying * 0.8
        }
      },
    }),
    [],
  )
}

export function NeonSigns({ mats, signs }: { mats: DenMaterials; signs: NeonSigns }) {
  return (
    <>
      {SIGNS.map((sign, i) => (
        <group key={sign.text} position={sign.position} rotation={sign.rotation}>
          {/* Dark backing plate and two standoff pins, so the letters read as
              mounted hardware rather than floating type. */}
          <mesh material={mats.shell} position={[0, 0, -0.03]}>
            <boxGeometry args={[sign.plate[0], sign.plate[1], 0.03]} />
          </mesh>
          <mesh material={mats.metal} position={[-sign.plate[0] * 0.36, 0, -0.055]}>
            <boxGeometry args={[0.03, 0.03, 0.05]} />
          </mesh>
          <mesh material={mats.metal} position={[sign.plate[0] * 0.36, 0, -0.055]}>
            <boxGeometry args={[0.03, 0.03, 0.05]} />
          </mesh>
          <Text
            ref={(node: unknown) => {
              signs.refs.current[i] = node as TroikaText | null
            }}
            font={RAJDHANI}
            fontSize={sign.size}
            letterSpacing={0.06}
            color={sign.color}
            anchorX="center"
            anchorY="middle"
            // Fades in with the room; the act writes this every frame.
            fillOpacity={0}
            outlineOpacity={0}
            outlineWidth={0.005}
            outlineColor={TUBE_DIM}
            material-toneMapped={false}
            material-depthWrite={false}
          >
            {sign.text}
          </Text>
        </group>
      ))}
    </>
  )
}

/** Deterministic 0..1 from an integer — a paused frame looks identical. */
function hash(n: number): number {
  const x = Math.sin(n * 91.7) * 47453.1234
  return x - Math.floor(x)
}
