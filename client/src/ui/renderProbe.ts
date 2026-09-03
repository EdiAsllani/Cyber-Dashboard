import { debug } from './debugFlag'

/**
 * Debug-only render counter, exposed as `window.__renders`.
 *
 * The core performance invariant of this phase is that scrolling drives zero
 * React renders — everything scroll-driven happens in useFrame or through a
 * subscribe → DOM mutation. This makes that testable instead of assumed:
 * snapshot the counts, sweep the whole journey, compare. Only the act-name
 * change and a quality-tier switch should ever move a number.
 *
 * Counting during render is a side effect, which is exactly why it is gated
 * behind ?debug and compiles out of a production bundle.
 */
const counts: Record<string, number> = {}

if (debug) {
  ;(window as unknown as Record<string, unknown>).__renders = counts
}

export function useRenderProbe(name: string): void {
  if (debug) counts[name] = (counts[name] ?? 0) + 1
}
