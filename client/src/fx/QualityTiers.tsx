import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useJourney, type Quality } from '../state/journey'

/**
 * Live quality tiers. drei's PerformanceMonitor watches the real frame rate and
 * we step the tier down (or back up) in response; PostFX and the wall material
 * both read `quality` from the store.
 *
 * The tier also picks the render resolution. dpr is clamped to the device ratio
 * so the high tier supersamples only where the display actually asks for it.
 */

const TIER_DPR: Record<Quality, number> = { high: 2, medium: 1.5, low: 1 }
const LADDER: readonly Quality[] = ['high', 'medium', 'low']

export function QualityTiers() {
  const setDpr = useThree((s) => s.setDpr)

  const apply = (next: Quality) => {
    const { quality, setQuality } = useJourney.getState()
    if (quality === next) return
    setQuality(next)
    setDpr(Math.min(window.devicePixelRatio, TIER_DPR[next]))
  }

  const shift = (delta: number) => {
    const i = LADDER.indexOf(useJourney.getState().quality)
    apply(LADDER[Math.min(LADDER.length - 1, Math.max(0, i + delta))])
  }

  return (
    <PerformanceMonitor
      // Stop after a few oscillations rather than thrashing between tiers
      // forever; the third flip hands over to onFallback.
      flipflops={3}
      onDecline={() => shift(1)}
      onIncline={() => shift(-1)}
      onFallback={() => apply('low')}
    />
  )
}
