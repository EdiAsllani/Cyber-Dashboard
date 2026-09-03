import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import { useJourney } from '../state/journey'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * The one and only scroll pipeline (DECISIONS D-04).
 *
 * Lenis smooths the native scroll, ScrollTrigger converts it into a normalized
 * 0..1 scrub, and that number is pushed straight into the zustand store.
 * Nothing else in the app may create a scroller — no drei ScrollControls, no
 * CSS `scroll-behavior: smooth`.
 *
 * Must be called once, at DOM level (outside <Canvas>).
 */
export function useScrollRig(debug = false): void {
  const reducedMotion = useJourney((s) => s.reducedMotion)
  const mode = useJourney((s) => s.mode)
  const lenisRef = useRef<Lenis | null>(null)

  useGSAP(() => {
    // prefers-reduced-motion: no smoother at all — native scroll still drives
    // ScrollTrigger, it just doesn't get inertia.
    if (!reducedMotion) {
      const lenis = new Lenis({ lerp: 0.09 })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)
      if (debug) debugHandles(lenis)

      // Boot locks scrolling; the lock is lifted by the mode effect below.
      if (useJourney.getState().mode === 'boot') lenis.stop()

      const trigger = createTrigger()
      return () => {
        trigger.kill()
        gsap.ticker.remove(raf)
        gsap.ticker.lagSmoothing(500, 33)
        lenis.destroy()
        lenisRef.current = null
      }
    }

    const trigger = createTrigger()
    return () => trigger.kill()
    // revertOnUpdate is required, not optional. Given a dependency array,
    // useGSAP sets deferCleanup and only reverts its context on UNMOUNT — a
    // dependency change re-runs the callback without ever calling the cleanup
    // we return. Flipping reducedMotion then leaves the old ScrollTrigger and
    // Lenis alive alongside the new ones (verified: getAll().length went to 2),
    // which is exactly the duplicate-smoother trap.
  }, { dependencies: [reducedMotion, debug], revertOnUpdate: true })

  // Scroll lock while the boot screen is up: no peeking at the wall before
  // JACK IN. Also guarantees the journey always starts from t=0.
  useEffect(() => {
    const locked = mode === 'boot'
    const lenis = lenisRef.current
    if (locked) {
      window.scrollTo(0, 0)
      document.body.style.overflow = 'hidden'
      lenis?.stop()
    } else {
      document.body.style.overflow = ''
      lenis?.start()
      // body overflow changed the max scroll — recompute trigger bounds.
      ScrollTrigger.refresh()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mode])
}

/** Console handles for pinning progress while taking screenshots. */
function debugHandles(lenis: Lenis): void {
  Object.assign(window as unknown as Record<string, unknown>, {
    __lenis: lenis,
    __scrollTrigger: ScrollTrigger,
    __journey: useJourney,
    __seek: (p: number) => lenis.scrollTo(p * lenis.limit, { immediate: true }),
    // Pins progress without moving the document — the reliable way to grab
    // per-act screenshots, since a scrolled page confuses capture tooling.
    __pin: (p: number) => useJourney.setState({ progress: p }),
  })
}

function createTrigger(): ScrollTrigger {
  return ScrollTrigger.create({
    trigger: '.scroll-track',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      useJourney.setState({ progress: self.progress })
      const { mode, enterDen, exitDen } = useJourney.getState()
      if (self.progress > 0.997 && mode === 'journey') enterDen()
      else if (self.progress < 0.985 && mode === 'den') exitDen()
    },
  })
}
