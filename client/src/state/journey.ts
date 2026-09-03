import { create } from 'zustand'

/**
 * THE central contract for the Blackwall journey.
 *
 * `progress` is written ~60x/second from the ScrollTrigger callback, so it is
 * *transient* state: no component may subscribe to it with a plain selector.
 *   - inside `useFrame`: read `useJourney.getState().progress`
 *   - in the DOM:        `subscribeProgress()` + mutate a ref's style
 * `mode` / `quality` / `reducedMotion` change rarely — selectors are fine there.
 */

export type Mode = 'boot' | 'journey' | 'den'
export type Quality = 'high' | 'medium' | 'low'

export interface JourneyState {
  mode: Mode
  progress: number
  quality: Quality
  reducedMotion: boolean
  jackIn: () => void
  enterDen: () => void
  exitDen: () => void
  setQuality: (q: Quality) => void
}

function initialReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Returning the untouched state object is a genuine no-op in zustand
// (Object.is short-circuit) — listeners are not notified.
export const useJourney = create<JourneyState>((set) => ({
  mode: 'boot',
  progress: 0,
  quality: 'high',
  reducedMotion: initialReducedMotion(),
  jackIn: () => set((s) => (s.mode === 'boot' ? { mode: 'journey' } : s)),
  enterDen: () => set((s) => (s.mode === 'journey' ? { mode: 'den' } : s)),
  exitDen: () => set((s) => (s.mode === 'den' ? { mode: 'journey' } : s)),
  setQuality: (quality) => set((s) => (s.quality === quality ? s : { quality })),
}))

/** Frame-loop read. Never subscribe to progress. */
export const getProgress = (): number => useJourney.getState().progress

/**
 * DOM-side progress consumer: fires only when progress actually moved.
 * Callers mutate refs (`el.style.transform`), they do not setState.
 */
export function subscribeProgress(cb: (p: number) => void): () => void {
  cb(useJourney.getState().progress)
  return useJourney.subscribe((s, prev) => {
    if (s.progress !== prev.progress) cb(s.progress)
  })
}

/** Keeps `reducedMotion` in sync with the OS setting. Call once from App. */
export function watchReducedMotion(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const sync = () => useJourney.setState({ reducedMotion: mq.matches })
  sync()
  mq.addEventListener('change', sync)
  return () => mq.removeEventListener('change', sync)
}
