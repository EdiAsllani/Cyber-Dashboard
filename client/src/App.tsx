import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { subscribeProgress, useJourney, watchReducedMotion } from './state/journey'
import { useScrollRig } from './rig/useScrollRig'
import { actAt } from './rig/acts'
import { CameraRig } from './rig/CameraRig'
import { PathHelper } from './rig/PathHelper'

const debug = import.meta.env.DEV && location.search.includes('debug')

/** Progress readout driven by store.subscribe → DOM mutation. Zero re-renders. */
function ScrollReadout() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(
    () =>
      subscribeProgress((p) => {
        const el = ref.current
        if (!el) return
        const { act, local } = actAt(p)
        el.textContent = `T ${p.toFixed(3)} — ACT ${act.id} ${act.name} ${(local * 100).toFixed(0)}%`
      }),
    [],
  )
  return <span className="status" ref={ref} />
}

export default function App() {
  const [status, setStatus] = useState('LINKING…')
  const mode = useJourney((s) => s.mode)
  useScrollRig(debug)

  useEffect(watchReducedMotion, [])

  // TODO(Task 7): BootScreen owns this gesture; auto-jack-in until it exists.
  useEffect(() => {
    useJourney.getState().jackIn()
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/health', { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { db: boolean }) =>
        setStatus(d.db ? 'LINK ESTABLISHED — DB BREACHED' : 'API UP — DB OFFLINE'),
      )
      .catch(() => setStatus('NO CARRIER'))
    return () => ctl.abort()
  }, [])

  return (
    <>
      <div className="canvas-wrap">
        <Canvas
          camera={{ position: [0, 1.6, 26], fov: 55, near: 0.1, far: 120 }}
          dpr={[1, 2]}
          gl={{ antialias: false }}
        >
          <color attach="background" args={['#050505']} />
          <CameraRig />
          {debug && <PathHelper />}
        </Canvas>
      </div>
      <div className="hud">
        <span className="title">CYBER-DASHBOARD // {mode.toUpperCase()}</span>
        <span className="status">{status}</span>
        <ScrollReadout />
      </div>
      <div className="scroll-track" aria-hidden />
    </>
  )
}
