# Phase 2 Implementation Plan — The Blackwall Journey

*Written 2026-09-03 for an implementing agent (Claude Code / Opus 5) with no prior context on this project. Read this whole document before writing code.*

---

## 0. Context — what this project is and where it stands

**CYBER-DASHBOARD // BLACKWALL** is a personal, non-commercial, Cyberpunk-2077-inspired 3D dashboard. The finished app: the user scrolls *through* the game's "Blackwall" (a wall of red/black digital energy), dives down a data tunnel, and lands in a small 3D cyberpunk office ("the Den") whose monitors open terminal apps. Full design: [docs/ARCHITECTURE.md](../ARCHITECTURE.md) · phases: [docs/ROADMAP.md](../ROADMAP.md) · locked decisions: [docs/DECISIONS.md](../DECISIONS.md) · research with verified links: [docs/research/](../research/01-frontend-3d.md).

**Phase 1 is done and committed.** The repo currently has:

- `client/` — Vite 8 + React 19 + TypeScript 7 + react-three-fiber 9.7 / drei 10.7 / three 0.185 / zustand 5. Currently renders a spinning red wireframe cube ([client/src/App.tsx](../../client/src/App.tsx)) with a DOM HUD showing `/api/health` status. `client/src/styles.css` defines the palette CSS variables. `npm run typecheck` must stay green (note: TS7 needs `src/vite-env.d.ts` for CSS imports — already present).
- `server/` — ASP.NET Core 10 minimal API + Postgres. **Phase 2 does not touch the server.**
- `docker-compose.yml` — dev environment. Run everything with `docker compose up --build --watch` (client at http://localhost:5173, HMR verified working through compose watch). Bare-metal `cd client && npm run dev` also works if faster for iteration.

**Phase 2 goal (from ROADMAP):** the scroll journey. Five acts driven by one continuous scroll: approach the Blackwall (custom GLSL wall) → pierce it (glitch spike) → fly a data tunnel → dissolve into a *placeholder* room shell → settle into interactive mode. Postprocessing chain, boot/loading screen, quality tiers, reduced-motion fallback. **The real office room is Phase 3 — build only a placeholder shell here.**

**Skills:** this account has `threejs-*` skills enabled (fundamentals, geometry, materials, shaders, lighting, textures, loaders, animation, interaction, postprocessing). If they appear in your available-skills list, invoke the relevant one before its task: `threejs-shaders` before Task 4, `threejs-geometry` (instancing) before Task 6, `threejs-postprocessing` before Task 5.

**Conventions:** commit at the end of each numbered task (conventional message, end with `Co-Authored-By:` line for your model). Never break `npm run typecheck`. Keep the HUD/status strings in the established diegetic voice (`LINK ESTABLISHED — DB BREACHED` etc.).

---

## 1. New dependencies (Task 0)

```bash
cd client && npm i gsap @gsap/react lenis @react-three/postprocessing && npm i -D leva r3f-perf
```

Expected majors (verified compatible 2026-09, research 01): gsap 3.15+ (all plugins free, public npm), lenis 1.3+, @react-three/postprocessing 3.1+ (peers: fiber ≥9.7, react ^19). leva + r3f-perf are dev-tuning tools, imported only behind the debug flag (§9). If `@react-three/postprocessing` peer-conflicts with the installed fiber 9.7.0, check its release notes — do NOT downgrade fiber.

Note: they are runtime imports gated by `import.meta.env.DEV || location.search.includes('debug')`; keeping them in devDependencies is fine since Vite bundles from node_modules regardless — but if `npm ci --omit=dev` is ever used for a client prod image, move them to dependencies. Add a comment in package.json is unnecessary; just gate the imports so production builds tree-shake them (use dynamic `import()` inside the debug branch).

---

## 2. Target file layout (client/src)

```
src/
├── main.tsx                    (unchanged)
├── App.tsx                     (rewritten: composition root)
├── styles.css                  (extended: scroll track, HUD acts, boot screen)
├── vite-env.d.ts               (unchanged)
├── state/
│   └── journey.ts              (zustand store — THE central contract, build first)
├── rig/
│   ├── useScrollRig.ts         (Lenis + ScrollTrigger → store.progress)
│   ├── CameraRig.tsx           (curve-following camera, inside Canvas)
│   └── acts.ts                 (act boundaries + helpers, pure functions)
├── scene/
│   ├── JourneyScene.tsx        (mounts acts, toggles visibility per act)
│   ├── acts/
│   │   ├── Act1Blackwall.tsx   (the wall + dust particles)
│   │   ├── Act3Tunnel.tsx      (instanced data streaks)
│   │   └── Act5DenShell.tsx    (placeholder room, dissolve-in)
│   └── materials/
│       ├── glsl/noise.ts       (vendored MIT simplex/FBM as template strings)
│       ├── blackwallMaterial.ts
│       └── dissolveMaterial.ts
├── fx/
│   └── PostFX.tsx              (EffectComposer chain, act-driven params)
└── ui/
    ├── BootScreen.tsx          (loading + "JACK IN" gate)
    └── Hud.tsx                 (act-aware overlay text + progress line)
```

---

## 3. The central contract: `state/journey.ts` (Task 1)

Everything reads from this store; nothing else owns journey state.

```ts
import { create } from 'zustand'

export type Mode = 'boot' | 'journey' | 'den'
export type Quality = 'high' | 'medium' | 'low'

interface JourneyState {
  mode: Mode
  progress: number        // 0..1 scroll scrub, written ~every frame (transient!)
  quality: Quality
  reducedMotion: boolean
  jackIn: () => void      // boot -> journey
  enterDen: () => void    // journey -> den (scroll end)
  exitDen: () => void     // den -> journey (scrolling back up)
  setQuality: (q: Quality) => void
}
```

**Hard rules (research 01 §6 — R3F pitfalls):**
- `progress` is written via `useJourney.setState({ progress })` from the ScrollTrigger callback. **No React component may subscribe to `progress` with a plain selector** (that re-renders 60×/s). Inside `useFrame`, read `useJourney.getState().progress`. DOM consumers (HUD progress bar) use `useJourney.subscribe` in a `useEffect` and mutate DOM refs (`el.style.transform`), not state.
- `mode`, `quality`, `reducedMotion` change rarely — normal selectors are fine for those.
- Initialize `reducedMotion` from `window.matchMedia('(prefers-reduced-motion: reduce)')` and subscribe to changes.

### Act mapping: `rig/acts.ts` (pure, unit-testable by inspection)

```ts
export const ACTS = [
  { id: 1, name: 'APPROACH',      start: 0.00, end: 0.25 },
  { id: 2, name: 'CONTACT',       start: 0.25, end: 0.40 },
  { id: 3, name: 'BREACH',        start: 0.40, end: 0.70 },
  { id: 4, name: 'DECOMPRESSION', start: 0.70, end: 0.85 },
  { id: 5, name: 'THE DEN',       start: 0.85, end: 1.00 },
] as const

export function actAt(t: number): { act: typeof ACTS[number]; local: number }
// local = (t - start) / (end - start), clamped 0..1

export function actWindow(t: number, start: number, end: number): number
// 0 outside [start,end], ramps 0→1→0 inside with smoothstep edges (like drei's curve())
// use for effect intensities that swell mid-act
```

---

## 4. Scroll rig: `rig/useScrollRig.ts` (Task 1)

DOM structure in `App.tsx`:

```tsx
<div className="canvas-wrap">…<Canvas/>…</div>   // position: fixed, inset 0 (exists)
<div className="scroll-track" aria-hidden />      // height: 600svh — provides scroll length
```

`styles.css`: change `overflow: hidden` on html/body to `overflow-x: hidden` (we now need vertical scroll); `.scroll-track { height: 600svh; pointer-events: none; }`.

Implementation (verified glue pattern, research 01 §2):

```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
gsap.registerPlugin(ScrollTrigger, useGSAP)
```

- Hook `useScrollRig()` called once in `App` (DOM level, NOT inside Canvas).
- If `reducedMotion` or mode `boot`: create Lenis only when journeying; while `boot`, lock scroll (`document.body.style.overflow = 'hidden'` or Lenis `stop()`), release on `jackIn()`.
- Lenis: `const lenis = new Lenis({ lerp: 0.09 })` (skip Lenis entirely when reducedMotion — native scroll still drives ScrollTrigger).
- Glue: `lenis.on('scroll', ScrollTrigger.update)`; `gsap.ticker.add((t) => lenis.raf(t * 1000))`; `gsap.ticker.lagSmoothing(0)`.
- One trigger:

```ts
ScrollTrigger.create({
  trigger: '.scroll-track', start: 'top top', end: 'bottom bottom',
  scrub: true,
  onUpdate: (self) => {
    useJourney.setState({ progress: self.progress })
    const { mode } = useJourney.getState()
    if (self.progress > 0.999 && mode === 'journey') useJourney.getState().enterDen()
    if (self.progress < 0.98  && mode === 'den')     useJourney.getState().exitDen()
  },
})
```

- All setup inside `useGSAP(() => {...}, [])` so StrictMode double-invoke cleans up; destroy Lenis in the cleanup return.
- `ScrollTrigger.refresh()` on window resize is automatic; just don't create competing scrollers (rule: **one scroll pipeline** — no drei ScrollControls anywhere).

**Done when:** with a temporary `console.log`/debug HUD, scrolling smoothly sweeps `progress` 0→1, survives HMR (no duplicate triggers), StrictMode clean.

---

## 5. Camera rig: `rig/CameraRig.tsx` (Task 2)

Component inside `<Canvas>`. Owns the default camera during `journey` mode.

```ts
// Position path — tune later with leva; these are the starting values.
const PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.6, 26),     // t=0    far void
  new THREE.Vector3(0.6, 1.7, 14),   //        drift in
  new THREE.Vector3(0, 1.6, 6),      // ~0.25  close to wall (wall plane at z=2)
  new THREE.Vector3(0, 1.6, 1.0),    // ~0.40  piercing it
  new THREE.Vector3(1.2, 1.2, -12),  //        tunnel wobble
  new THREE.Vector3(-1.2, 2.0, -26), //        tunnel wobble
  new THREE.Vector3(0, 1.6, -40),    // ~0.70  tunnel exit
  new THREE.Vector3(0, 1.5, -47),    // ~0.85  room threshold
  new THREE.Vector3(0, 1.4, -50),    // t=1    desk height, in the den
])
const LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.6, 2),      // stare at the wall
  new THREE.Vector3(0, 1.6, 2),
  new THREE.Vector3(0, 1.6, 0),
  new THREE.Vector3(0, 1.5, -10),
  new THREE.Vector3(0, 1.4, -20),
  new THREE.Vector3(0, 1.6, -34),
  new THREE.Vector3(0, 1.5, -48),
  new THREE.Vector3(0, 1.35, -52.5), // the (future) desk
  new THREE.Vector3(0, 1.35, -52.5),
])
```

`useFrame`: read `progress` via `getState()`, ease it per-frame toward target with `THREE.MathUtils.damp` (small extra smoothing on top of scrub), then `PATH.getPointAt(p)` → `camera.position`, `LOOK.getPointAt(p)` → `lookAt`. Add a subtle act-2 shake: `position.x/y += (noise or Math.sin(time*47)) * shakeAmp` where `shakeAmp = actWindow(p, 0.30, 0.42) * 0.06` (zero when reducedMotion).

In `den` mode this component stops driving the camera (Phase 3 adds CameraControls; for now it just freezes at the end pose — an idle micro-drift `sin(t*0.3)*0.02` is a nice touch).

**Done when:** temporary colored boxes placed at act boundaries fly past in order; camera lands stably at the den pose at t=1; no jitter (damping works); scroll up returns cleanly.

---

## 6. The Blackwall: `scene/materials/` + `scene/acts/Act1Blackwall.tsx` (Tasks 3–4) — THE CENTERPIECE

### 6.1 `glsl/noise.ts` (Task 3)
Vendor Ashima/McEwan **webgl-noise** `snoise(vec3)` (MIT — copy from https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83, keep the license header) as an exported template string, plus:

```glsl
float fbm(vec3 p) {           // 5 octaves, G = 0.5 (iq's standard form)
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * snoise(p); p *= 2.02; a *= 0.5; }
  return v;
}
float ridge(vec3 p) { return pow(1.0 - abs(snoise(p)), 4.0); }
```

### 6.2 `blackwallMaterial.ts` (Task 4)
Use drei's `shaderMaterial` + `extend` (pattern: research 01 §4, Maxime Heckel article). Uniforms:

| uniform | type | meaning | act driver |
|---|---|---|---|
| uTime | float | seconds | always |
| uIntensity | float 0..1 | overall energy | 0.55 idle → 1.0 through act 2 |
| uWarp | float | domain-warp strength | 0.6 → 1.4 in act 2 |
| uGlitch | float 0..1 | slice displacement amount | 0.08 idle, → 0.9 act 2 |
| uDisplace | float | vertex displacement amplitude | 0.35 → 1.2 act 2 |
| uColorA/B/C | vec3 | #880425, #C5003C, #FF003C | static |

Geometry: `<planeGeometry args={[48, 20, 160, 72]} />` at `z=2`, facing camera. `toneMapped={false}` is not a material prop for ShaderMaterial — instead just output HDR values > 1 for filaments; Bloom (threshold ≈ 1) catches them.

**Vertex shader:** displace `position.z += fbm(vec3(position.xy * 0.18, uTime * 0.15)) * uDisplace;` pass world uv.

**Fragment shader skeleton (implement exactly this structure, then tune):**

```glsl
vec2 uv = vUv * vec2(3.2, 1.4);                       // stretch horizontally
// glitch slices (cheap, before noise): quantized rows randomly shove uv.x
float row = floor(vUv.y * 96.0);
float slice = step(1.0 - uGlitch * 0.12, fract(sin(row * 91.17 + floor(uTime * 8.0) * 13.7) * 43758.5));
uv.x += slice * (fract(sin(row * 17.3) * 12345.6) - 0.5) * 0.35;

// domain-warped FBM (iq recipe)
vec3 p = vec3(uv * 1.6, uTime * 0.06);
float q = fbm(p);
float r = fbm(p + q * uWarp + vec3(1.7, 9.2, uTime * 0.10));
float v = fbm(p + r * uWarp);
v = v * 0.5 + 0.5;

// color ramp: void -> blood -> arasaka -> hot
vec3 col = mix(vec3(0.02), uColorA, smoothstep(0.25, 0.55, v));
col = mix(col, uColorB, smoothstep(0.55, 0.78, v));
col = mix(col, uColorC, smoothstep(0.78, 0.95, v));

// upward-crawling emissive bands
float band = smoothstep(0.92, 1.0, sin((vUv.y * 14.0 - uTime * 0.7) * 6.2831) * 0.5 + 0.5);
col += uColorC * band * 0.6 * uIntensity;

// ridged lightning filaments -> HDR for bloom
float fil = ridge(vec3(uv * 2.3, uTime * 0.22)) * ridge(vec3(uv * 1.1 + 5.0, uTime * 0.13));
col += uColorC * fil * 3.5 * uIntensity;          // deliberately > 1.0

// vertical fade at wall edges so it dissolves into the void
col *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
gl_FragColor = vec4(col, 1.0);
```

`Act1Blackwall.tsx` also mounts ~800 drifting dust points (`<points>` + small PointsMaterial, additive, opacity 0.35) between camera start and wall, and drives uniforms in `useFrame` from `progress`: `uIntensity = 0.55 + actWindow(p, 0.22, 0.42) * 0.45`, etc. Visibility: `visible={p < 0.45}` (toggle `visible`, never unmount — research 01 §6).

**Iterate visually before moving on** (leva sliders on every uniform, §9). This task is done when a static screenshot of act 1 already looks like *the* Blackwall: boiling red-on-black energy with occasional bright filaments, not lava and not fog.

### 6.3 Act 2 — Contact (part of Task 5)
No new scene objects. Between t=0.25–0.40: wall uniforms ramp (above), camera shake (§5), postFX Glitch + ChromaticAberration ramp (§7), and a fullscreen red flash at the pierce moment: a DOM div `.pierce-flash` whose opacity = `actWindow(p, 0.37, 0.43)` (driven via store subscribe → style mutation). At t≥0.40 wall becomes invisible, tunnel becomes visible — the flash covers the swap.

---

## 7. PostFX: `fx/PostFX.tsx` (Task 5)

```tsx
<EffectComposer>
  <Bloom mipmapBlur intensity={…} luminanceThreshold={1.0} />
  <ChromaticAberration ref={caRef} />
  <Glitch ref={glitchRef} />          {/* only mounted while 0.24 < p < 0.44 */}
  <Noise premultiply blendFunction={BlendFunction.SCREEN} />
  <Vignette darkness={0.75} />
</EffectComposer>
```

Drive per-frame from `useFrame` (refs, not props — props re-render): `caRef.current.offset.set(base + actWindow(p,0.28,0.44)*0.006, …)`; Bloom intensity 0.9 baseline → 1.6 in act 2 → 1.1 in tunnel. Docs links per effect: research 02 §3. Glitch mount/unmount is acceptable (it's between-act, one-time compile — or keep mounted with `active` flag if it flickers).

**Quality tiers** (drei `PerformanceMonitor` wrapping inside Canvas):
- high: dpr [1,2], full chain
- medium (onDecline): dpr [1,1.5], drop ChromaticAberration + Noise
- low (onFallback / second decline): dpr 1, Bloom only, wall shader `#define OCTAVES 3` variant (pass as `defines` or a `uOctaves`-style branch — simplest: two compiled materials, swap by quality)
Store tier in `useJourney.quality`; PostFX + materials read it (rare-change selector is fine).

`reducedMotion`: skip Glitch entirely, no camera shake, no pierce flash strobe (use a slow fade instead).

---

## 8. Tunnel + Den shell (Task 6)

### `Act3Tunnel.tsx`
- One `<instancedMesh args={[undefined, undefined, COUNT]}>` — COUNT = 2500 (high) / 1200 (medium) / 600 (low). Geometry: `boxGeometry args={[0.02, 0.02, 3.5]}` (long thin streaks). Material: `meshBasicMaterial color="#ff003c" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.85} toneMapped={false}`.
- Distribute instances in a hollow cylinder around the camera path segment z ∈ [-2, -44]: radius 2.5–7, uniform angle; ~8% of instances tinted `#03d8f3` (use `setColorAt`) as netrunner-cyan accents.
- Motion illusion: instances are static; in `useFrame` wrap them — `if (instanceZ > camera.z + 4) instanceZ -= 46` (store base positions in a Float32Array, update matrices only for wrapped ones per frame, `instanceMatrix.needsUpdate = true`).
- `<fog attach="fog" args={['#050505', 4, 30]} />` scene-level (mount while act ∈ 3–4), plus 2–3 large emissive rings (`torusGeometry`, hot red, HDR) sliding past for scale landmarks.
- Optional if time allows: a second instanced set of glyph quads using a `CanvasTexture` atlas (katakana-ish chars drawn to canvas, red). Base requirement is streaks only.
- Visibility window: `0.35 < p < 0.75`.

### `Act5DenShell.tsx` — placeholder only (Phase 3 replaces internals, keep the component seam)
- Room centered at `z = -52`: floor 10×10, back wall, two side walls (BoxGeometry slabs, `meshStandardMaterial color="#0d0d0d"`), ceiling optional.
- Neon trim: 4–6 thin emissive boxes (`emissive '#c5003c'`, `emissiveIntensity 2.5`, toneMapped false) along wall/floor edges.
- Desk placeholder: dark box at (0, 0.75, -52.8); two monitor placeholder planes (16:10, ~0.55 wide) at desk height with `emissive '#ff003c' emissiveIntensity 1.2` screens.
- One `pointLight` (#ff2450, intensity 8, distance 12) + `ambientLight` 0.15.
- **Dissolve-in (Act 4):** all shell materials share `dissolveMaterial.ts` — a `CustomShaderMaterial`-style patch is overkill; simplest robust approach: `onBeforeCompile` on the standard material injecting `if (snoise(vWorldPos*3.0) + uReveal*2.0 - 1.0 < 0.0) discard;` + an emissive red edge where the threshold is near zero, with `uReveal = actWindow-style ramp` from p∈[0.70,0.85]. If `onBeforeCompile` fights you > ~1h, fallback: crossfade a wireframe clone (opacity 1→0) over the solid shell (opacity 0→1) across act 4 — visually acceptable, ship it, note it as Phase 3 debt.
- Visibility: `p > 0.62`.

**Done when:** the full scroll reads as one continuous dive — wall → flash → streaming tunnel → room materializing — with no visible pop of objects appearing/disappearing (the flash and fog must cover both seams).

---

## 9. Boot screen, HUD, debug tooling (Task 7)

### `ui/BootScreen.tsx`
- Covers viewport (`position:fixed`, z-index above canvas), `--void` background.
- Content: fake BIOS/breach lines typing in (plain CSS/JS interval, e.g. `ARASAKA MILITECH BIOS v7.7.1 …`, `NEURAL LINK … OK`, `ICE SIGNATURE DETECTED: BLACKWALL`), then drei `useProgress` for real asset % (Phase 2 has few assets — fine), then a pulsing button: `[ JACK IN ]`.
- Click → `useJourney.getState().jackIn()` → fade out (CSS transition, then unmount), unlock scroll. Gating on a click is deliberate: it later unlocks audio, and it forces a user gesture before scroll-hijacking.
- While mode === 'boot', scroll is locked (§4).

### `ui/Hud.tsx` (replaces the Phase-1 HUD block in App.tsx)
- Top-left: `CYBER-DASHBOARD // <ACT NAME>` — act name from a **throttled** store subscription (subscribe, compare act id, setState only when the act actually changes — that's ≤5 renders per journey).
- Top-right: `API: BREACHED` health check (port the existing fetch).
- Bottom-center, act 1 only: `SCROLL TO BREACH ▼` (CSS pulse; hidden once p > 0.05).
- Left edge: 2px vertical progress line, `transform: scaleY(progress)` mutated via store.subscribe on a ref — no React re-renders.
- Act 5 (mode den): swap to `CONNECTION STABLE // THE DEN` then fade HUD to 20% opacity after 2s.
- Glitch text effect on act changes: a CSS class (`clip-path` slices + 2 colored text-shadows, 300ms) — pure CSS, no lib.

### Debug tooling (gated)
`const debug = import.meta.env.DEV && location.search.includes('debug')`. When true, lazy-import and mount: `<Perf position="bottom-right" />` (r3f-perf) and leva panel exposing: every blackwall uniform, bloom intensity, act boundary markers toggle, camera-path helper toggle (`<Line points={PATH.getPoints(120)}>` + boundary spheres). Leva's `useControls` must only run when debug (wrap in a `<DebugControls>` component conditionally mounted).

---

## 10. App.tsx composition (end state)

```tsx
<BootScreen />                          {/* self-unmounts after jackIn */}
<div className="canvas-wrap">
  <Canvas camera={{ position: [0, 1.6, 26], fov: 55, near: 0.1, far: 120 }}
          dpr={[1, 2]} gl={{ antialias: false /* postFX chain supplies AA-ish softness; revisit if edges crawl */ }}>
    <color attach="background" args={['#050505']} />
    <Suspense fallback={null}>
      <CameraRig />
      <JourneyScene />                  {/* Act1Blackwall / Act3Tunnel / Act5DenShell */}
      <PostFX />
    </Suspense>
    <PerformanceMonitor onDecline={…} onFallback={…}>…</PerformanceMonitor>
  </Canvas>
</div>
<Hud />
<div className="scroll-track" aria-hidden />
```

`useScrollRig()` called in App. Keep `frameloop` default (`always`) — uniforms animate every frame in this phase.

---

## 11. Task order & verification (each task = one commit)

| # | Task | Verify before committing |
|---|---|---|
| 0 | Install deps | `npm run typecheck` green; `docker compose up --watch` still boots |
| 1 | journey store + acts.ts + scroll rig + scroll-track CSS | progress sweeps 0→1 smoothly (debug readout); HMR doesn't duplicate triggers; StrictMode clean |
| 2 | CameraRig + curves (+ debug path helper) | fly-through past placeholder boxes at act marks; stable end pose; scroll-up clean |
| 3 | noise.ts vendored | typecheck; shader compiles in a test quad |
| 4 | Blackwall material + Act1 + dust | **visual bar:** boiling red/black energy wall w/ HDR filaments; 60fps at dpr 2 on the dev machine; tune with leva |
| 5 | PostFX chain + act-2 ramp + pierce flash + quality tiers | act 2 feels violent but readable; Bloom only catches HDR (scene isn't uniformly glowing); tier downgrade visibly drops cost, no crash |
| 6 | Tunnel + DenShell + dissolve | full-journey continuity, no pops; instanced tunnel ≥60fps (check r3f-perf draw calls — must be ~1 for streaks) |
| 7 | BootScreen + Hud + debug gating | boot gates scroll; act names change with glitch effect; progress line via ref (React DevTools highlight-updates shows NO per-frame renders) |
| 8 | Reduced-motion pass + polish | `prefers-reduced-motion` → native scroll, no shake/strobe/glitch; resize mid-journey doesn't break (ScrollTrigger.refresh) |
| 9 | Acceptance + docs | run the checklist below; update ROADMAP (Phase 2 ✅ + date), README status line; final commit |

### Acceptance checklist (from ROADMAP, expanded — all must pass)
1. Full 0→1 scroll plays all five acts as one continuous dive at ~60fps, dpr≤2, on a mid-range GPU (use the dev machine; r3f-perf: < 300 draw calls, < 16ms frame).
2. Quality tiers switch live via PerformanceMonitor (verify by forcing `onDecline` manually or CPU-throttling).
3. Reduced-motion fallback path works (emulate via devtools rendering settings).
4. No React re-renders driven by scroll (React DevTools highlight updates).
5. `npm run typecheck` green; app runs identically through `docker compose up --watch` (compose-watch sync — no polling flags needed beyond what's set).
6. Scroll up/down repeatedly, resize, and HMR-edit a shader mid-journey: no crashes, no duplicated triggers, no WebGL context loss.
7. Boot screen gates entry; scrolling before JACK IN does nothing.

### Screenshot evidence (attach/keep in the final report)
Capture at p ≈ 0.05, 0.3, 0.38, 0.55, 0.78, 1.0. To pin progress for screenshots: `window.scrollTo(0, p * (document.body.scrollHeight - innerHeight))` in the console (with Lenis, call `lenis.scrollTo` — expose the instance on `window.__lenis` when debug).

---

## 12. Known traps (read before coding — sourced from docs/research/01 & 02)

1. **StrictMode double-effects**: all GSAP/Lenis setup inside `useGSAP` (or manual `gsap.context`) with full cleanup; Lenis must be destroyed or you get two competing smoothers after HMR.
2. **Never `setState` per frame** — the store discipline in §3 is the difference between 60fps and 20.
3. **One scroll pipeline** — no drei ScrollControls, no CSS `scroll-behavior: smooth`, html/body must not get `overflow: hidden` after boot.
4. **HDR + Bloom**: filaments/neon need output values > 1 and `luminanceThreshold ~1`, and (for built-in materials) `toneMapped={false}` — otherwise Bloom smears the whole frame.
5. **Additive transparency**: tunnel streaks need `depthWrite={false}` or they z-fight; draw order issues → set `renderOrder` if streaks vanish behind fog.
6. **Toggle `visible`, don't unmount** acts (unmount = material recompile hitch mid-scroll). Exception: Glitch effect mount is act-boundary, acceptable.
7. **`three` colors in shaders**: pass `new THREE.Color('#c5003c')` — hex strings in uniforms won't upload.
8. **Vite + GLSL strings**: keep GLSL in `.ts` template strings (no glsl-plugin dependency needed); drei `shaderMaterial` hot-reload needs a changing `key` (see drei docs) or full-reload on shader edit is fine.
9. **TS7 quirk**: side-effect/CSS imports need the existing `vite-env.d.ts`; don't remove it. If any new tooling chokes on `typescript@7`, do NOT downgrade — check research 01 §1 first.
10. **Compose watch**: node_modules must stay out of sync rules (already configured); if HMR seems dead in Docker, check `docker compose watch` is actually running (it's a separate mode from plain `up`).
11. **Palette discipline**: only the CSS-variable palette (`#050505/#0d0d0d/#880425/#c5003c/#ff003c/#e8e8e8`, cyan `#03d8f3` accents ≤10%). No CP2077 logos/assets — original work only (CDPR fan-content rules, research 02 §5).
