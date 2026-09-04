import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MONITORS, MONITOR_SIDES, SCREEN_PROUD } from './constants'
import { createDissolveMaterial } from '../materials/dissolveMaterial'
import { createScreenFeed, type ScreenFeed } from './screenFeed'
import { useJourney, type MonitorSide, type Quality } from '../../state/journey'
import { debug } from '../../ui/debugFlag'
import type { ThreeEvent } from '@react-three/fiber'

/**
 * The two screens: geometry, the canvas feed behind them, and (Task 7) the
 * click targets.
 *
 * The hook and the component are split because the act owns the frame loop.
 * `useMonitorScreens` builds the materials and feeds and hands back a `tick`;
 * the act calls that from its single useFrame, which is what keeps the den at
 * one callback rather than one per decoration.
 */

/** Repaint ceiling per tier. Below this the feed just holds its last frame. */
const FEED_HZ: Record<Quality, number> = { high: 5, medium: 4, low: 2 }

/** Idle emissive. Hover adds `userData.boost` on top. */
export const BASE_EMISSIVE = 1.15

/** Hover glow — enough to read as "lit up", not enough to push logs into bloom. */
const HOVER_BOOST = 0.35

export interface MonitorScreen {
  side: MonitorSide
  material: THREE.MeshStandardMaterial
  texture: THREE.CanvasTexture
  feed: ScreenFeed
}

export interface MonitorScreens {
  screens: MonitorScreen[]
  /**
   * Advance both feeds. `live` is false whenever repainting would be wasted —
   * the den is not visible, or the terminal overlay is covering it.
   */
  tick(now: number, quality: Quality, live: boolean, reducedMotion: boolean): void
}

export function useMonitorScreens(reveal: THREE.IUniform<number>): MonitorScreens {
  const screens = useMemo(
    () =>
      MONITOR_SIDES.map((side, i) => {
        // A different seed per monitor: same painter, two independent logs.
        const feed = createScreenFeed(0x5eed + i * 977)
        const texture = new THREE.CanvasTexture(feed.canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        // The panel is viewed at an angle from close range; a mip chain on a
        // canvas this size costs an upload per repaint for no visible gain.
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        const material = createDissolveMaterial(
          {
            color: '#050505',
            emissive: new THREE.Color('#ffffff'),
            emissiveMap: texture,
            emissiveIntensity: BASE_EMISSIVE,
            roughness: 0.6,
            metalness: 0.05,
            toneMapped: false,
          },
          reveal,
        )
        // Hover adds to this; initialised here so the flicker maths never
        // multiplies by undefined.
        material.userData.boost = 0
        return { side, material, texture, feed } satisfies MonitorScreen
      }),
    [reveal],
  )

  useEffect(
    () => () => {
      for (const s of screens) {
        s.material.dispose()
        s.texture.dispose()
      }
    },
    [screens],
  )

  return useMemo<MonitorScreens>(
    () => ({
      screens,
      tick(now, quality, live, reducedMotion) {
        for (const s of screens) {
          if (live && s.feed.tick(now, FEED_HZ[quality])) {
            // Only on an actual repaint: the flag re-uploads the whole canvas.
            s.texture.needsUpdate = true
            if (debug) {
              const w = window as unknown as { __feedPaints?: number }
              w.__feedPaints = (w.__feedPaints ?? 0) + 1
            }
          }
          // Mains hum, as a hash on a 24Hz grid rather than a sine — a smooth
          // wobble reads as a fade, a stepped one reads as a CRT.
          const flicker = reducedMotion ? 1 : 0.96 + 0.04 * hash(Math.floor(now * 24))
          const boost = (s.material.userData.boost as number) ?? 0
          s.material.emissiveIntensity = (BASE_EMISSIVE + boost) * flicker
        }
      },
    }),
    [screens],
  )
}

export function MonitorScreens({ screens }: { screens: MonitorScreen[] }) {
  return (
    <>
      {screens.map(({ side, material }) => {
        const { screen, center, yaw } = MONITORS[side]
        // Pointer events fire during the flythrough too, so every handler
        // gates on den mode. The out-handler is the one exception: it only
        // ever *resets*, and a hover that started legitimately must be able
        // to end after a mode flip (scroll-out mid-hover never re-fires it,
        // which is why exitDen clears `hovered` as well).
        const over = (e: ThreeEvent<PointerEvent>) => {
          if (useJourney.getState().mode !== 'den') return
          e.stopPropagation()
          material.userData.boost = HOVER_BOOST
          document.body.style.cursor = 'pointer'
          useJourney.setState({ hovered: side })
        }
        const out = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          material.userData.boost = 0
          document.body.style.cursor = ''
          if (useJourney.getState().hovered === side) useJourney.setState({ hovered: null })
        }
        const click = (e: ThreeEvent<MouseEvent>) => {
          if (useJourney.getState().mode !== 'den') return
          e.stopPropagation()
          material.userData.boost = 0
          document.body.style.cursor = ''
          useJourney.getState().focusMonitor(side)
        }
        return (
          // The offset has to be applied *inside* the yawed group, not added
          // to the centre in den space: the screens are toed in, so a
          // world-space z nudge would slide the plane sideways relative to
          // its bezel and let the far edge sink behind the frame.
          <group key={side} position={[center[0], center[1], center[2]]} rotation={[0, yaw, 0]}>
            <mesh
              material={material}
              position={[0, 0, SCREEN_PROUD]}
              // The two screens are the only hittable things in the den;
              // `useSceneryRaycast` reads this flag and leaves them alone.
              userData={{ interactive: true }}
              onPointerOver={over}
              onPointerOut={out}
              onClick={click}
            >
              <planeGeometry args={[screen[0], screen[1]]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

/** Deterministic 0..1 from an integer — a paused frame looks identical. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}
