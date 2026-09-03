import type { RefObject } from 'react'
import type { EffectComposer } from 'postprocessing'

/**
 * Module-level ref to the one EffectComposer instance.
 *
 * PostFX is a singleton, and the debug GPU probe needs the composer *at call
 * time* — an effect that reads a ref right after mount misses it, because the
 * composer fills its ref from a later child render, not from a PostFX render.
 */
export const composerHandle: RefObject<EffectComposer | null> = { current: null }
