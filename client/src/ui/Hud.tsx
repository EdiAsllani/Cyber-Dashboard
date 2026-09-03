import { useEffect, useRef, useState } from 'react'
import { useJourney, subscribeProgress } from '../state/journey'
import { ACTS, actAt } from '../rig/acts'
import { useRenderProbe } from './renderProbe'

/**
 * Diegetic overlay. Two rules hold the whole thing together:
 *  - the progress line is mutated through a ref, never through state
 *  - the act name only setStates when the act id actually changes, which is at
 *    most four times across a whole journey
 */

const DEN_DIM_MS = 2000

function useActName(): string {
  const mode = useJourney((s) => s.mode)
  const [id, setId] = useState<number>(ACTS[0].id)

  useEffect(() => {
    let current = id
    return subscribeProgress((p) => {
      const next = actAt(p).act.id
      if (next !== current) {
        current = next
        setId(next)
      }
    })
    // `id` is intentionally not a dependency: re-subscribing on every act change
    // would reset the closure's comparison baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (mode === 'den' || mode === 'terminal') return 'CONNECTION STABLE // THE DEN'
  return `CYBER-DASHBOARD // ${ACTS.find((a) => a.id === id)?.name ?? ''}`
}

export function Hud() {
  useRenderProbe('Hud')
  const mode = useJourney((s) => s.mode)
  const title = useActName()
  const [status, setStatus] = useState('LINKING…')
  const [dim, setDim] = useState(false)

  const line = useRef<HTMLSpanElement>(null)
  const hint = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/health', { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { db: boolean }) =>
        setStatus(d.db ? 'API: BREACHED' : 'API: UP // DB OFFLINE'),
      )
      .catch(() => setStatus('API: NO CARRIER'))
    return () => ctl.abort()
  }, [])

  // Progress line + scroll hint: pure DOM mutation, zero React renders.
  useEffect(
    () =>
      subscribeProgress((p) => {
        if (line.current) line.current.style.transform = `scaleY(${p})`
        if (hint.current) hint.current.style.opacity = p > 0.05 ? '0' : '1'
      }),
    [],
  )

  // Re-trigger the CSS glitch animation whenever the act name changes.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.classList.remove('hud__title--glitch')
    // Force a reflow so removing and re-adding the class restarts the run.
    void el.offsetWidth
    el.classList.add('hud__title--glitch')
  }, [title])

  // Settling into the den: let the HUD recede so the room reads.
  useEffect(() => {
    if (mode !== 'den' && mode !== 'terminal') {
      setDim(false)
      return
    }
    if (mode === 'terminal') return
    const t = window.setTimeout(() => setDim(true), DEN_DIM_MS)
    return () => window.clearTimeout(t)
  }, [mode])

  // Terminal mode: the CRT overlay owns the screen, so the HUD steps aside.
  // Hidden by class rather than unmounted — the rail's scaleY lives in an
  // inline style written through a ref, and a remounted element would come
  // back at scaleY(0) until the next scroll event moved it again.
  const hidden = mode === 'terminal'

  return (
    <>
      <div className={`hud${dim ? ' hud--dim' : ''}${hidden ? ' hud--hidden' : ''}`}>
        <span className="hud__title hud__title--glitch" ref={titleRef} data-text={title}>
          {title}
        </span>
        <span className="hud__status">{status}</span>
      </div>

      <div className={`hud__rail${hidden ? ' hud--hidden' : ''}`} aria-hidden>
        <span ref={line} />
      </div>

      {/* The pulse lives on the inner span, not this div. CSS animations sit
          above inline styles in the cascade, so animating opacity here would
          silently override the ref-driven hide and the hint would never go
          away. */}
      <div className={`hud__hint${hidden ? ' hud--hidden' : ''}`} ref={hint} aria-hidden>
        <span>SCROLL TO BREACH ▼</span>
      </div>
    </>
  )
}
