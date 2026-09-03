import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { getProgress, subscribeProgress, useJourney, watchReducedMotion } from './state/journey'
import { useScrollRig } from './rig/useScrollRig'
import { actAt } from './rig/acts'

const debug = import.meta.env.DEV && location.search.includes('debug')

function BreachCube() {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (!ref.current) return
    ref.current.rotation.x += dt * 0.4
    ref.current.rotation.y += dt * 0.6
    // temporary: proves the frame loop reads progress without re-rendering
    ref.current.position.z = getProgress() * -20
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color="#ff003c" wireframe />
    </mesh>
  )
}

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
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]}>
          <BreachCube />
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
