import { useEffect, useRef } from 'react'
import { subscribeProgress, useJourney } from '../state/journey'
import { actWindow } from '../rig/acts'

/**
 * The white-hot red flash that covers the moment the camera crosses the wall
 * plane (z = 2, around t = 0.36). It hides the act-2 → act-3 object swap: the
 * wall goes invisible and the tunnel appears behind the flash's peak.
 *
 * A DOM overlay rather than a scene object, so it also washes over the HUD, and
 * driven by subscribe → style mutation: no React render is involved.
 */
export function PierceFlash() {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useJourney((s) => s.reducedMotion)

  useEffect(
    () =>
      subscribeProgress((p) => {
        const el = ref.current
        if (!el) return
        // Reduced motion gets a wider, dimmer swell — same story beat, no punch.
        const a = reducedMotion
          ? actWindow(p, 0.28, 0.5, 0.5) * 0.45
          : actWindow(p, 0.32, 0.43, 0.42) * 0.96
        el.style.opacity = String(a)
      }),
    [reducedMotion],
  )

  return <div className="pierce-flash" ref={ref} aria-hidden />
}
