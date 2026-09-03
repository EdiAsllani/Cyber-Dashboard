import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  EffectGroup,
  Glitch,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, GlitchMode, ToneMappingMode } from 'postprocessing'
import type { BloomEffect, ChromaticAberrationEffect, GlitchEffect } from 'postprocessing'
import { getProgress, useJourney } from '../state/journey'
import { actWindow } from '../rig/acts'
import { composerHandle } from './composerHandle'

/**
 * The look pass. Bloom is the backbone — the wall's filaments and every neon
 * trim output values above 1.0 and the threshold sits at 1.0, so bloom picks
 * up exactly those and leaves the rest of the frame alone.
 *
 * Everything animated is driven through refs inside useFrame. Passing these as
 * React props would re-render the composer 60 times a second, and changing the
 * *set* of mounted effects makes postprocessing rebuild (recompile) its merged
 * EffectPass — which is why Glitch stays mounted for the whole journey and is
 * switched via `mode` instead of being added and removed at the act boundary.
 */

/** Act 2 CONTACT: the violence window, matched to the camera shake. */
const CONTACT_FROM = 0.26
const CONTACT_TO = 0.44

export function PostFX() {
  const quality = useJourney((s) => s.quality)
  const reducedMotion = useJourney((s) => s.reducedMotion)

  const bloom = useRef<BloomEffect>(null)
  const ca = useRef<ChromaticAberrationEffect>(null)
  const glitch = useRef<GlitchEffect>(null)

  useFrame(() => {
    const p = getProgress()
    const spike = actWindow(p, CONTACT_FROM, CONTACT_TO)
    // Tunnel keeps a slightly hotter bloom than the approach; the den cools off.
    const tunnel = actWindow(p, 0.42, 0.78, 0.25)

    if (bloom.current) {
      bloom.current.intensity = 0.9 + spike * 0.7 + tunnel * 0.2
    }

    if (ca.current) {
      // A constant sliver of RGB split near the wall, blown out at the pierce.
      const base = reducedMotion ? 0.0004 : 0.0008
      const x = base + spike * 0.006
      ca.current.offset.set(x, x * 0.6)
    }

    if (glitch.current) {
      const live = !reducedMotion && spike > 0.02
      glitch.current.mode = live ? GlitchMode.SPORADIC : GlitchMode.DISABLED
      if (live) {
        glitch.current.minStrength = 0.05 + spike * 0.25
        glitch.current.maxStrength = 0.2 + spike * 0.8
      }
    }
  })

  return (
    <EffectComposer ref={composerHandle} multisampling={0}>
      {/* Three passes, and the split is forced, not stylistic. postprocessing
          refuses to merge a UV-warping effect with a convolution effect, and
          refuses to merge two convolution effects at all. Glitch warps UVs;
          Bloom AND ChromaticAberration both declare CONVOLUTION (the latter is
          easy to miss — it offsets channels in its vertex shader). All three
          therefore need their own EffectPass, or the composer throws
          "Effects that transform UVs are incompatible with convolution
          effects" and the WebGL context is lost on mount. */}
      <EffectGroup>
        <Glitch
          ref={glitch}
          mode={GlitchMode.DISABLED}
          delay={[0.6, 2.2]}
          duration={[0.06, 0.3]}
          strength={[0.05, 0.3]}
          ratio={0.75}
        />
      </EffectGroup>
      <EffectGroup>
        <Bloom
          ref={bloom}
          mipmapBlur
          intensity={0.9}
          luminanceThreshold={1.0}
          luminanceSmoothing={0.06}
          // Bloom's mipmap chain is the one genuinely expensive pass, so the
          // low tier halves its internal resolution. On a dpr-1 display this
          // is most of what the ladder actually buys.
          resolutionScale={quality === 'low' ? 0.5 : 1}
        />
        {quality === 'high' && !reducedMotion && (
          <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.12} />
        )}
        {quality !== 'low' && <Vignette offset={0.28} darkness={0.75} />}
        {/* Rolls the HDR filaments off instead of clipping them to flat white.
            Our ShaderMaterials bypass three's in-shader tone mapping, so
            without this the wall's hot cores would hard-clip. */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectGroup>
      {quality === 'high' && (
        <EffectGroup>
          <ChromaticAberration ref={ca} offset={[0.0008, 0.0005]} />
        </EffectGroup>
      )}
    </EffectComposer>
  )
}
