import { useCallback, useEffect, useState } from 'react'
import { useJourney, type MonitorSide } from '../state/journey'
import { Terminal } from '../terminal/Terminal'
import { wallet } from '../terminal/skins/wallet'
import { repo } from '../terminal/skins/repo'
import { useRenderProbe } from './renderProbe'
import type { TerminalSkin } from '../terminal/types'

/**
 * The fullscreen CRT frame that owns the screen in terminal mode.
 *
 * Sequencing rules, both learned the hard way in the plan:
 *  - It fades in on `arrived` — the flag the rig flips when the dolly has
 *    measurably landed — never on a timer, because timers drift from damp
 *    under a low frame rate.
 *  - Leaving is overlay-first: fade out 200ms, *then* `blurMonitor()`. The
 *    camera pulls back only once the frame is gone, so the den is never
 *    visible through a half-dead overlay.
 *
 * The ESC listener lives here, not in App: the component only exists in
 * terminal mode, so the listener cannot leak into the journey.
 */

const SKINS: Record<MonitorSide, TerminalSkin> = { left: wallet, right: repo }

export function TerminalOverlay() {
  useRenderProbe('TerminalOverlay')
  const mode = useJourney((s) => s.mode)
  if (mode !== 'terminal') return null
  return <Frame />
}

function Frame() {
  const arrived = useJourney((s) => s.arrived)
  const focused = useJourney((s) => s.focused) ?? 'left'
  const [leaving, setLeaving] = useState(false)

  const disconnect = useCallback(() => {
    setLeaving((already) => {
      if (!already) window.setTimeout(() => useJourney.getState().blurMonitor(), 200)
      return true
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disconnect()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disconnect])

  const skin = SKINS[focused]

  return (
    <div className={`term${arrived && !leaving ? ' term--on' : ''}`}>
      <div className="term__bezel">
        <header className="term__header">
          <span>{skin.title}</span>
          <button className="term__disconnect" onClick={disconnect}>
            [ DISCONNECT ]
          </button>
        </header>
        {/* Mounted on arrival, so the banner types in front of the user
            rather than behind an invisible frame mid-dolly. */}
        {arrived && <Terminal skin={skin} />}
      </div>
    </div>
  )
}
