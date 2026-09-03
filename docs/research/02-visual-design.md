# Research 02 — Blackwall visuals, shaders, palette, fonts, assets

*Verified 2026-09-03. Shadertoy blocks bots, so those links are title/ID-confirmed via search but not opened — marked [ST]. Everything else was fetched.*

## 1. The Blackwall shader — recipe

Large plane (or slightly curved cylinder section) with a custom `shaderMaterial`:

1. 4–6 octave **FBM of 3D simplex noise**, **domain-warped** (`f(p + fbm(p))`) for the "boiling" look
2. Remap through a black → deep-red → hot-red ramp; `smoothstep` bands for emissive filaments
3. Second high-frequency noise layer stepped into horizontal **glitch slices** that offset UVs
4. Vertex displacement along normals from the same FBM
5. **Lightning filaments** = ridged noise (`1.0 - abs(noise)`) raised to a power, output colors > 1.0 with `toneMapped={false}` → selective Bloom picks them up

Tunnel act: instanced glyph quads and/or a cylinder with scrolling digital-rain texture (`atan/length` UV wrap).

### Shader references
- [Warping / procedural graphics — iq (lsl3RH)](https://www.shadertoy.com/view/lsl3RH) [ST] — canonical domain-warped FBM "living smoke"; ~80% of the Blackwall look once tinted red/black
- [Matrix Rain (lsXSDn)](https://www.shadertoy.com/view/lsXSDn) [ST] · [Matrix Rain MCP (33l3Df)](https://www.shadertoy.com/view/33l3Df) [ST] — digital rain, recolor to red
- [RGB Shift Glitch (4t23Rc)](https://www.shadertoy.com/view/4t23Rc) [ST] · [Glitchy Glitch (wld3WN)](https://www.shadertoy.com/view/wld3WN) [ST] — stripe displacement + RGB split
- [Cyber Punk (7lVSDw)](https://www.shadertoy.com/view/7lVSDw) [ST] · [3D Tunnel (MsySRm)](https://www.shadertoy.com/view/MsySRm) [ST] — dive-sequence tunnels
- ⚠️ Shadertoy defaults to **CC BY-NC-SA** — learn from them, reimplement; don't paste.

### R3F shader tutorials (fetched)
- [The Study of Shaders with R3F — Maxime Heckel](https://blog.maximeheckel.com/posts/the-study-of-shaders-with-react-three-fiber/) — best single guide: shaderMaterial, uniforms, useFrame animation, live scenes
- [Shader-based reveal effect — Codrops](https://tympanus.net/codrops/2024/12/02/how-to-code-a-shader-based-reveal-effect-with-react-three-fiber-glsl/) — noise dissolve driven by `uProgress` — the exact pattern for the through-the-wall transition (Act 2) and room materialization (Act 4)
- [Subtle shader background — Codrops](https://tympanus.net/codrops/2024/10/31/how-to-code-a-subtle-shader-background-effect-with-react-three-fiber/) — fullscreen quad + SDF template for monitor screensavers
- [Wawa Sensei shader intro](https://wawasensei.dev/courses/react-three-fiber/lessons/shaders-introduction) — fundamentals (preview free)
- [drei shaderMaterial docs](https://drei.docs.pmnd.rs/shaders/shader-material) — auto uniform setters, hot-reload `key`

### GLSL fundamentals (fetched)
- [The Book of Shaders](https://thebookofshaders.com/) — ch. 10–13 (random, noise, cellular, FBM) are the wall's toolkit
- [webgl-noise gist (patriciogonzalezvivo)](https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83) — MIT-licensed simplex/Perlin/FBM — the license-clean noise source to vendor
- [iq — FBM](https://iquilezles.org/articles/fbm/) · [iq — Domain Warping](https://iquilezles.org/articles/warp/) — the theory behind steps 1–2
- [lygia.xyz](https://lygia.xyz/) — modular shader library; ⚠️ Prosperity License = non-commercial by default (fine for this fan project)

## 2. Post-processing chain

`@react-three/postprocessing` over [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) (Zlib). Docs fetched per effect:

| Effect | Use here | Docs |
|---|---|---|
| Bloom | backbone of the neon look; selective via emissive >1 + `toneMapped={false}`, `mipmapBlur` | [Bloom](https://react-postprocessing.docs.pmnd.rs/effects/bloom) |
| ChromaticAberration | subtle constant RGB split near the wall | [ChromaticAberration](https://react-postprocessing.docs.pmnd.rs/effects/chromatic-aberration) |
| Glitch | Act 2 pierce bursts (`GlitchMode.SPORADIC`, strength ramped by scroll) | [Glitch](https://react-postprocessing.docs.pmnd.rs/effects/glitch) |
| Scanline | terminal/monitor moments | [Scanline](https://react-postprocessing.docs.pmnd.rs/effects/scanline) |
| Noise | film grain (SCREEN blend, premultiply) | [Noise](https://react-postprocessing.docs.pmnd.rs/effects/noise) |
| Vignette | always-on framing | [Vignette](https://react-postprocessing.docs.pmnd.rs/effects/vignette) |
| DotScreen | optional halftone on monitor close-ups | [DotScreen](https://react-postprocessing.docs.pmnd.rs/effects/dot-screen) |

**CRT frame for terminals:** [crt-mattias.glsl (libretro)](https://github.com/libretro/glsl-shaders/blob/master/crt/shaders/crt-mattias.glsl) shows the technique (barrel-distort UVs, `sin(uv.y * lines)` scanlines, per-channel offset, vignette) — ⚠️ unclear license, **reimplement** the (simple) techniques rather than copying.

## 3. Palette & typography

**Palette** (verified: [SchemeColor "Cyberpunk"](https://www.schemecolor.com/cyberpunk.php) = #FCEE0C / #000000 / #03D8F3; community CP2077-UI palettes add red #FF003C / #C5003C, dark red #880425 — those pages blocked fetching, [unverified]):

```
--void:        #050505   /* backgrounds */
--panel:       #0D0D0D
--arasaka-red: #C5003C   /* primary accent (deep) */
--hot-red:     #FF003C   /* emissive / filaments */
--blood:       #880425   /* borders, dim states */
--ghost:       #E8E8E8   /* body text */
--cp-yellow:   #FCEE0A   /* sparing warning accents */
--netrunner:   #03D8F3   /* optional REPO.NET cyan */
```

**Fonts** — all on Google Fonts (SIL OFL), specimen pages verified:
- [Rajdhani](https://fonts.google.com/specimen/Rajdhani) — **the actual CP2077 UI font** per [Fonts In Use](https://fontsinuse.com/uses/60926/cyberpunk-2077-video-game) (verified) → our primary UI face
- [Orbitron](https://fonts.google.com/specimen/Orbitron) — the game's secondary face → display/headers
- [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) — terminal body text
- [VT323](https://fonts.google.com/specimen/VT323) — CRT flavor moments
- [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) — alternate techno headings
- Skip logo-lookalike "Cyberpunk" fonts ([Fonts4Free one](https://www.fonts4free.net/cyberpunk-font.html) is personal-use-only and intentionally close to the trademarked logo).

## 4. 3D assets (verified downloadable, license from the fetched page)

| Asset | License | Notes |
|---|---|---|
| [Cyberpunk Desk — Cisco](https://sketchfab.com/3d-models/cyberpunk-desk-8bc4ca48b2e244ff8b5ba714a2ec1963) | CC BY 4.0 | 13.2k tris, ready-made desk vignette |
| [Cyberpunk Office (Hubs) — keianhzo](https://sketchfab.com/3d-models/hubs-cyberpunk-office-060fdeda3f1a406b9cacd67504979029) | CC BY 4.0 | 82.1k tris, whole low-poly office room |
| [CRT Computer Monitor — fizyman](https://sketchfab.com/3d-models/crt-computer-monitor-f2ff0013f86e4cd0a2aee183a23bdfee) | CC BY | 3.7k tris, 4K PBR, **separate screen-glass material** → hero monitor |
| [Low Poly Sci-Fi Control Room — IQINISO](https://sketchfab.com/3d-models/low-poly-sci-fi-control-room-free-download-69a97b5821424674a5c559efdca0dcc6) | CC BY | 1.8k tris |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | **CC0** | ~140 interior props, GLTF included |
| [Quaternius Ultimate Modular Sci-Fi Pack](https://quaternius.com/packs/ultimatemodularscifi.html) | **CC0** | 46 modular interior pieces |
| [Simple Computer Monitor — Poly Pizza](https://poly.pizza/m/b03hFZNSltH) | CC BY 3.0 | poly.pizza = good CC0/CC-BY search engine |
| [Shanghai Bund HDRI — Poly Haven](https://polyhaven.com/a/shanghai_bund) | **CC0** | night neon skyline — window/environment lighting |

**Plan (per DECISIONS D-05):** primitive room shell + emissive/shader screens (tiny bundle, license-pure, screens are our meshes), sprinkled with CC0 Kenney/Quaternius props; fizyman CRT as hero-monitor candidate. CC-BY items need a credits line (add a `credits` section to the README when used).

## 5. Fan-content legality (fetched)

[CD PROJEKT RED Fan Content Guidelines](https://www.cdprojektred.com/en/fan-content):
- Non-commercial fan works welcomed; no paywalls/commercial use (only platform-partner monetization + reasonable donations)
- **Must display:** "This is an unofficial fan work and is not approved/endorsed by CD PROJEKT RED" prominently → goes in our README + app footer/boot screen
- No CDPR names in domains, no standalone games/apps from their IP, no in-game music
- Ripped game assets only in game-related fan content — our plan (original shaders/models, inspired-by styling, no official logos/logotype) is the safe lane
