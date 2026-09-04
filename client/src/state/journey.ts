import { create } from 'zustand'

/**
 * THE central contract for the Blackwall journey.
 *
 * `progress` is written ~60x/second from the ScrollTrigger callback, so it is
 * *transient* state: no component may subscribe to it with a plain selector.
 *   - inside `useFrame`: read `useJourney.getState().progress`
 *   - in the DOM:        `subscribeProgress()` + mutate a ref's style
 * `mode` / `quality` / `reducedMotion` change rarely — selectors are fine there.
 * So do `focused` / `arrived`: they flip at most twice per terminal visit. But
 * anything they *drive* per frame (emissive boosts, flicker) still reads
 * `getState()` inside `useFrame` rather than re-rendering.
 */

export type Mode = 'boot' | 'journey' | 'den' | 'terminal'
export type Quality = 'high' | 'medium' | 'low'
export type MonitorSide = 'left' | 'right'

export interface JourneyState {
  mode: Mode
  progress: number
  quality: Quality
  reducedMotion: boolean
  /** Which monitor the camera is locked to. Non-null exactly in terminal mode. */
  focused: MonitorSide | null
  /** Set by the rig once the dolly has actually landed — the overlay's cue. */
  arrived: boolean
  /** Which screen the pointer is over (den mode only) — drives the HUD hint. */
  hovered: MonitorSide | null
  jackIn: () => void
  enterDen: () => void
  exitDen: () => void
  focusMonitor: (side: MonitorSide) => void
  blurMonitor: () => void
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
  focused: null,
  arrived: false,
  hovered: null,
  jackIn: () => set((s) => (s.mode === 'boot' ? { mode: 'journey' } : s)),
  enterDen: () => set((s) => (s.mode === 'journey' ? { mode: 'den' } : s)),
  // Guarded even though the terminal's scroll lock already makes it
  // unreachable from there: the scroll trigger calls this blind on every
  // upward frame, and a stray exit would strand the overlay over the journey.
  // `hovered` is cleared too — a scroll-out mid-hover never fires pointerOut.
  exitDen: () =>
    set((s) => (s.mode === 'den' ? { mode: 'journey', focused: null, hovered: null } : s)),
  focusMonitor: (side) =>
    set((s) =>
      s.mode === 'den'
        ? { mode: 'terminal', focused: side, arrived: false, hovered: null }
        : s,
    ),
  blurMonitor: () =>
    set((s) => (s.mode === 'terminal' ? { mode: 'den', focused: null, arrived: false } : s)),
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

/**
 * Keeps `reducedMotion` in sync with the OS setting, and mirrors whatever the
 * store ends up holding onto `<html data-reduced-motion>`.
 *
 * The mirror matters because the flag can also be flipped at runtime (the debug
 * panel does it). CSS that only keyed off the media query would then disagree
 * with the scene, so the stylesheet honours both the query and the attribute.
 * Call once from App.
 */
export function watchReducedMotion(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}

  const reflect = (on: boolean) => {
    document.documentElement.dataset.reducedMotion = String(on)
  }

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const fromMedia = () => useJourney.setState({ reducedMotion: mq.matches })
  fromMedia()
  reflect(useJourney.getState().reducedMotion)

  mq.addEventListener('change', fromMedia)
  const unsub = useJourney.subscribe((s, prev) => {
    if (s.reducedMotion !== prev.reducedMotion) reflect(s.reducedMotion)
  })

  return () => {
    mq.removeEventListener('change', fromMedia)
    unsub()
  }
}
