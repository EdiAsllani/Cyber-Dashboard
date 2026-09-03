import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { composerHandle } from '../fx/composerHandle'

/**
 * Debug-only console bridge (mounted inside <Canvas>). Exposes the renderer so
 * GPU cost can be probed without requestAnimationFrame — useful because a
 * backgrounded tab throttles rAF to zero and normal FPS counters go silent.
 *
 * `__gpuProbe(n)` renders n frames back to back and then forces a pipeline
 * sync with a 1x1 readPixels, so the reported millisecond figure is real draw
 * cost rather than scheduler noise. (gl.finish() alone is a no-op on several
 * drivers, which reports impossibly fast frames.)
 */
export function DebugBridge() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const sync = () => {
      const ctx = gl.getContext()
      const px = new Uint8Array(4)
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    }
    const probe = (frames = 30) => {
      // Drive the post chain when it exists; timing gl.render alone would
      // silently omit every EffectPass.
      const composer = composerHandle.current
      const draw = composer ? () => composer.render(1 / 60) : () => gl.render(scene, camera)
      draw()
      sync()
      const t0 = performance.now()
      for (let i = 0; i < frames; i++) draw()
      sync()
      const total = performance.now() - t0
      return {
        frames,
        msPerFrame: +(total / frames).toFixed(2),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        programs: gl.info.programs?.length ?? 0,
        width: gl.domElement.width,
        height: gl.domElement.height,
      }
    }
    Object.assign(window as unknown as Record<string, unknown>, {
      __r3f: { gl, scene, camera },
      __gpuProbe: probe,
    })
  }, [gl, scene, camera])

  return null
}
