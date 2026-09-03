import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'

function BreachCube() {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (!ref.current) return
    ref.current.rotation.x += dt * 0.4
    ref.current.rotation.y += dt * 0.6
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color="#ff003c" wireframe />
    </mesh>
  )
}

export default function App() {
  const [status, setStatus] = useState('LINKING…')
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
        <span className="title">CYBER-DASHBOARD // PHASE 1</span>
        <span className="status">{status}</span>
      </div>
    </>
  )
}
