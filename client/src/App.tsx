import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useJourney, watchReducedMotion } from './state/journey'
import { useScrollRig } from './rig/useScrollRig'
import { CameraRig } from './rig/CameraRig'
import { PathHelper } from './rig/PathHelper'
import { JourneyScene } from './scene/JourneyScene'
import { PostFX } from './fx/PostFX'
import { QualityTiers } from './fx/QualityTiers'
import { BootScreen } from './ui/BootScreen'
import { Hud } from './ui/Hud'
import { PierceFlash } from './ui/PierceFlash'
import { DebugBridge } from './ui/DebugBridge'
import { DebugPanel, DebugPerf } from './ui/DebugPanel'
import { debug } from './ui/debugFlag'
import { useRenderProbe } from './ui/renderProbe'

export default function App() {
  useRenderProbe('App')
  useScrollRig(debug)
  useEffect(watchReducedMotion, [])
  const reducedMotion = useJourney((s) => s.reducedMotion)

  return (
    <>
      <BootScreen />

      <div className="canvas-wrap">
        <Canvas
          camera={{ position: [0, 1.6, 26], fov: 55, near: 0.1, far: 120 }}
          dpr={[1, 2]}
          // The post chain's bloom and tone map soften edges enough; MSAA on a
          // fullscreen procedural shader is cost for no visible gain.
          gl={{ antialias: false }}
        >
          <color attach="background" args={['#050505']} />
          <Suspense fallback={null}>
            <CameraRig />
            <JourneyScene />
            <PostFX />
          </Suspense>
          <QualityTiers />
          {debug && <PathHelper />}
          {debug && <DebugBridge />}
          {debug && <DebugPerf />}
        </Canvas>
      </div>

      <PierceFlash />
      <Hud />
      {debug && <DebugPanel />}

      {/* Provides the journey's scroll length. Holds no content. Reduced
          motion gets a shorter track: same five acts, half the wheel work. */}
      <div
        className={`scroll-track${reducedMotion ? ' scroll-track--short' : ''}`}
        aria-hidden
      />
    </>
  )
}
