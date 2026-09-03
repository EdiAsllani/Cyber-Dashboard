import { useEffect } from 'react'
import { useStore, useThree } from '@react-three/fiber'
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
  const store = useStore()
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
      // Live getters, not a snapshot: r3f can swap the default camera when the
      // <Canvas camera={...}> prop object changes identity, and a captured
      // reference then reports the position of an orphan that nothing writes —
      // which reads exactly like a frozen render loop.
      __r3f: {
        get gl() {
          return store.getState().gl
        },
        get scene() {
          return store.getState().scene
        },
        get camera() {
          return store.getState().camera
        },
      },
      __gpuProbe: probe,
      // Steps the frame loop by hand. The in-app browser only paints while its
      // pane is actually on screen, so requestAnimationFrame — and with it
      // every useFrame — sits at zero frames while a headless check is
      // running, and any damped transition looks frozen. This drives r3f's
      // own `advance` with a synthetic clock instead, which makes the camera
      // poses and reveal ramps verifiable without a visible viewport.
      __advance: (frames = 60, stepMs = 16) => {
        const { advance, clock } = store.getState()
        const t0 = performance.now()
        for (let i = 0; i < frames; i++) {
          // The timestamp handed to `advance` only feeds r3f's own
          // bookkeeping — every useFrame delta comes from `clock.getDelta()`,
          // which reads the real wall clock. In a tight loop that is ~0.1 ms
          // per step, so a damped transition would need thousands of frames to
          // resolve. Winding the clock back by the step makes each frame *see*
          // stepMs of elapsed time, which is what the callers actually mean.
          clock.oldTime -= stepMs
          advance(t0 + i * stepMs)
        }
        return frames
      },
    })
  }, [store, gl, scene, camera])

  return null
}
