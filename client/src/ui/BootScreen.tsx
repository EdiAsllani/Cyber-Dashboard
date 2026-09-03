import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useJourney } from '../state/journey'

/**
 * The gate. Fake breach BIOS types itself out, then a JACK IN button.
 *
 * Gating on a click is deliberate: it forces a user gesture before we hijack
 * the scroll, and Phase 6 needs that same gesture to unlock audio.
 */

const BOOT_LINES = [
  'ARASAKA MILITECH BIOS v7.7.1',
  'MEM CHECK ......................... 64 PB OK',
  'CYBERDECK: KIROSHI MK.4 // 3 SLOTS FREE',
  'MOUNTING /dev/cortex .............. OK',
  'NEURAL LINK ....................... OK',
  'ROUTING THROUGH NIGHT CITY RELAY .. OK',
  'ICE SIGNATURE DETECTED: BLACKWALL',
  'WARNING: NO SAFE RETURN PATH',
] as const

const LINE_MS = 190
/** Long enough for the fade-out transition in styles.css to finish. */
const FADE_MS = 700

export function BootScreen() {
  const mode = useJourney((s) => s.mode)
  const reducedMotion = useJourney((s) => s.reducedMotion)
  const { progress: assets, total } = useProgress()

  const [shown, setShown] = useState(reducedMotion ? BOOT_LINES.length : 0)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // Type the lines out. Reduced motion gets them all at once.
  useEffect(() => {
    if (reducedMotion || shown >= BOOT_LINES.length) return
    timer.current = window.setTimeout(() => setShown((n) => n + 1), LINE_MS)
    return () => window.clearTimeout(timer.current)
  }, [shown, reducedMotion])

  // Unmount only after the CSS fade, so the canvas isn't revealed abruptly.
  useEffect(() => {
    if (mode === 'boot') return
    setLeaving(true)
    const t = window.setTimeout(() => setGone(true), FADE_MS)
    return () => window.clearTimeout(t)
  }, [mode])

  if (gone || (mode !== 'boot' && !leaving)) return null

  const ready = shown >= BOOT_LINES.length
  // drei reports 100% with nothing queued, which is the usual case this phase.
  const assetsReady = total === 0 || assets >= 100

  return (
    <div className={`boot${leaving ? ' boot--leaving' : ''}`}>
      <div className="boot__panel">
        <pre className="boot__log">
          {BOOT_LINES.slice(0, shown).map((line) => (
            <span key={line} className="boot__line">
              {line}
            </span>
          ))}
        </pre>

        <div className="boot__meter" aria-hidden>
          <span style={{ transform: `scaleX(${assetsReady ? 1 : assets / 100})` }} />
        </div>

        <button
          type="button"
          className="boot__jack"
          disabled={!ready || !assetsReady}
          onClick={() => useJourney.getState().jackIn()}
        >
          {ready && assetsReady ? '[ JACK IN ]' : '[ ESTABLISHING LINK… ]'}
        </button>

        <p className="boot__disclaimer">
          This is an unofficial fan work and is not approved/endorsed by CD PROJEKT RED.
        </p>
      </div>
    </div>
  )
}
