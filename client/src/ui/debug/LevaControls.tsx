import { useControls } from 'leva'
import { useJourney, type Mode, type MonitorSide, type Quality } from '../../state/journey'

/**
 * Lives in its own lazily-imported module so `useControls` is only ever called
 * when the debug gate is open — a conditional hook is illegal, a conditionally
 * *mounted component* is fine.
 *
 * The wall's uniforms are driven every frame from progress, so exposing them as
 * sliders would fight the act ramps. What is actually useful to poke at is the
 * things nothing else writes: the tier, and where in the journey we are.
 */
export default function LevaControls() {
  const quality = useJourney((s) => s.quality)
  const reducedMotion = useJourney((s) => s.reducedMotion)
  const mode = useJourney((s) => s.mode)

  useControls(
    'JOURNEY',
    {
      progress: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.005,
        // leva fires onChange once on mount; without the guard, opening the
        // panel would snap the journey back to t=0.
        onChange: (v: number, _path: string, ctx: { initial?: boolean }) => {
          if (!ctx.initial) useJourney.setState({ progress: v })
        },
      },
      quality: {
        value: quality,
        options: ['high', 'medium', 'low'] satisfies Quality[],
        onChange: (q: Quality, _path: string, ctx: { initial?: boolean }) => {
          if (!ctx.initial) useJourney.getState().setQuality(q)
        },
      },
      reducedMotion: {
        value: reducedMotion,
        onChange: (v: boolean, _path: string, ctx: { initial?: boolean }) => {
          if (!ctx.initial) useJourney.setState({ reducedMotion: v })
        },
      },
      // Bypasses the mode guards on purpose: the point is to inspect a mode
      // without having to reach it through the journey. `focused` has to be
      // set alongside it or the terminal mode has no monitor to zoom at.
      mode: {
        value: mode,
        options: ['boot', 'journey', 'den', 'terminal'] satisfies Mode[],
        onChange: (m: Mode, _path: string, ctx: { initial?: boolean }) => {
          if (ctx.initial) return
          const focused: MonitorSide | null = m === 'terminal' ? 'left' : null
          useJourney.setState({ mode: m, focused, arrived: false })
        },
      },
      focused: {
        value: 'left',
        options: ['left', 'right'] satisfies MonitorSide[],
        onChange: (side: MonitorSide, _path: string, ctx: { initial?: boolean }) => {
          if (ctx.initial) return
          if (useJourney.getState().mode !== 'terminal') return
          useJourney.setState({ focused: side, arrived: false })
        },
      },
    },
    { collapsed: false },
  )

  return null
}
