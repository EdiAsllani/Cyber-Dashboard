import { lazy, Suspense, useEffect, useState } from 'react'

/**
 * leva + r3f-perf, loaded only when `?debug` is present.
 *
 * Both are devDependencies, so they must never appear in a production module
 * graph — hence dynamic import() rather than a top-level one. That also keeps
 * leva's `useControls` from ever running outside debug, which is what the rule
 * about conditional hooks actually requires.
 *
 * <DebugControls> mounts at DOM level; <DebugPerf> must be inside <Canvas>.
 */

const DebugControls = lazy(async () => {
  const { default: mod } = await import('./debug/LevaControls')
  return { default: mod }
})

export function DebugPanel() {
  return (
    <Suspense fallback={null}>
      <DebugControls />
    </Suspense>
  )
}

/** r3f-perf's HUD. Inside Canvas. */
export function DebugPerf() {
  const [Perf, setPerf] = useState<React.ComponentType<{ position?: string }> | null>(null)
  useEffect(() => {
    let alive = true
    void import('r3f-perf').then((mod) => {
      if (alive) setPerf(() => mod.Perf as React.ComponentType<{ position?: string }>)
    })
    return () => {
      alive = false
    }
  }, [])
  return Perf ? <Perf position="bottom-right" /> : null
}
