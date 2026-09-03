/**
 * Act boundaries for the journey, plus the pure helpers every act uses to turn
 * the single scroll scalar into per-effect intensities. No three.js, no React —
 * everything here is a pure function of `t` (0..1 scroll progress).
 */

export interface Act {
  readonly id: number
  readonly name: string
  readonly start: number
  readonly end: number
}

export const ACTS = [
  { id: 1, name: 'APPROACH', start: 0.0, end: 0.25 },
  { id: 2, name: 'CONTACT', start: 0.25, end: 0.4 },
  { id: 3, name: 'BREACH', start: 0.4, end: 0.7 },
  { id: 4, name: 'DECOMPRESSION', start: 0.7, end: 0.85 },
  { id: 5, name: 'THE DEN', start: 0.85, end: 1.0 },
] as const satisfies readonly Act[]

export type ActId = (typeof ACTS)[number]['id']

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** GLSL-style smoothstep that also accepts an inverted edge pair (e0 > e1). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** One-directional eased ramp — `ramp(t, 0.7, 0.85)` goes 0→1 across act 4. */
export const ramp = (t: number, from: number, to: number): number => smoothstep(from, to, t)

/** Which act `t` falls in, plus the 0..1 position inside it. */
export function actAt(t: number): { act: Act; local: number } {
  const p = clamp01(t)
  for (const act of ACTS) {
    if (p < act.end || act.id === ACTS[ACTS.length - 1].id) {
      return { act, local: clamp01((p - act.start) / (act.end - act.start)) }
    }
  }
  // unreachable — the loop always returns on the last act
  return { act: ACTS[0], local: 0 }
}

/**
 * 0 outside [start,end]; inside, swells 0→1→0 with smoothstep edges.
 * The workhorse for effect intensities that peak mid-act (camera shake,
 * glitch strength, the pierce flash).
 */
export function actWindow(t: number, start: number, end: number, edge = 0.35): number {
  if (end <= start) return 0
  const local = (t - start) / (end - start)
  if (local <= 0 || local >= 1) return 0
  const e = Math.min(Math.max(edge, 0.001), 0.5)
  return smoothstep(0, e, local) * smoothstep(1, 1 - e, local)
}

/** Linear map with clamping, for driving uniforms across an act. */
export function span(t: number, from: number, to: number, a: number, b: number): number {
  return a + (b - a) * clamp01((t - from) / (to - from || 1))
}
