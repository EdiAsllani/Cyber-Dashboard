# Research 01 — R3F stack, scroll rig, interactive screens, performance

*Verified 2026-09-03 via `npm view` + fetched docs (links checked that day unless marked [unverified]).*

## 1. Version matrix (npm `latest`)

| Package | Version | Note |
|---|---|---|
| react / react-dom | 19.2.8 | fiber 9 peer range `>=19 <19.3` — check before a 19.3 bump |
| three | 0.185.1 | satisfies fiber ≥0.156, drei ≥0.159 |
| @react-three/fiber | 9.7.0 | "fiber@9 pairs with react@19" — [install docs](https://r3f.docs.pmnd.rs/getting-started/installation) |
| @react-three/drei | 10.7.8 | drei 10 = the R3F-9 line |
| @react-three/postprocessing | 3.1.1 | peers fiber ≥9.7.0, postprocessing ^6.36 |
| vite | 8.2.2 | Vite 8 = Rolldown bundler; Node ^20.19 or ≥22.12 — [announcement](https://vite.dev/blog/announcing-vite8) |
| typescript | 7.0.2 | TS7 = native Go compiler — [GA post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/); pin ~6.0 if eslint tooling chokes (API gap until 7.1) |
| zustand | 5.0.15 | read via `getState()` in `useFrame`, never per-frame `setState` |
| gsap | 3.15.0 | ALL plugins free & on public npm (see §3); use `@gsap/react` `useGSAP` |
| lenis | 1.3.26 | renamed from `@studio-freight/lenis`; ships `lenis/react` |
| @xterm/xterm | 6.0.0 | scoped package (unscoped `xterm` deprecated) — only if we go xterm over custom terminal |

## 2. Scroll rig — decision input for D-04

**drei `<ScrollControls>` + `useScroll`** ([docs](https://drei.docs.pmnd.rs/controls/scroll-controls)): owns its scroll container; `offset`, `range()`, `curve()`, `visible()` map nicely to acts. But: no pinning concept, fights external smoothers (its `damping` + Lenis = double-damping), and the end-of-journey "unpin into interactive mode" means wrestling its container for wheel events.

**GSAP ScrollTrigger + Lenis** (recommended): one pinned, scrubbed timeline; acts = labels/nested tweens; shader uniforms are just tweened numbers; final trigger's `onLeave` flips the interactive-mode flag. Verified glue: `lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0)` — [Lenis repo](https://github.com/darkroomengineering/lenis), [ScrollTrigger docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [useGSAP](https://gsap.com/resources/React) (StrictMode-safe cleanup).

Rule either way ([R3F pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)): scroll progress goes into a ref/zustand-transient; camera mutated in `useFrame` via `curve.getPointAt(t)` on a `CatmullRomCurve3` (+ a second curve or `t+ε` for lookAt).

Tutorials/examples (fetched):
- [Wawa Sensei — R3F scroll animations](https://wawasensei.dev/tuto/react-three-fiber-tutorial-scroll-animations) — free, R3F + GSAP, with source
- [Codrops — camera fly-through on scroll (Theatre.js + R3F)](https://tympanus.net/codrops/2023/02/14/animate-a-camera-fly-through-on-scroll-using-theatre-js-and-react-three-fiber/) — keyframed path alternative to hand-placed curve points
- [Codrops — Reactive Depth: scroll-driven 3D tube (2026)](https://tympanus.net/codrops/2026/02/17/reactive-depth-building-a-scroll-driven-3d-image-tube-with-react-three-fiber/) — scroll *velocity* feeding shaders; model for our tunnel act
- [R3F examples gallery](https://r3f.docs.pmnd.rs/getting-started/examples) — "Camera scroll", "ScrollControls and minimap", "HTML input fields" sandboxes

## 3. GSAP licensing — confirmed free

- [gsap.com/pricing](https://gsap.com/pricing/): "GSAP is now 100% free for all users, thanks to Webflow's support" — every former Club plugin (ScrollTrigger, ScrollSmoother, SplitText, MorphSVG…) on public npm since 2025-06 — [3.13 release post](https://gsap.com/blog/3-13/). Commercial use explicitly permitted. Remember `gsap.registerPlugin(ScrollTrigger)`.

## 4. Interactive screens in 3D

- **drei `<Html transform occlude>`** ([docs](https://drei.docs.pmnd.rs/misc/html)) — real DOM projected onto a mesh; inputs/focus/IME work. Caveats verified: transform mode can render blurry (scale-parent-down/children-up trick), `occlude="blending"` only occludes rectangular elements cleanly, hidden Html can still capture clicks → keep `pointerEvents:'none'` until terminal mode.
- **Render-to-texture** (drei `RenderTexture`) — perfect occlusion/lighting, but it's an image: no real focus/a11y. Use for idle screensaver screens, not the live terminal.
- **Recommended pattern — zoom-then-overlay:** click → `CameraControls.setLookAt(...)` (promise-based) → on resolve, fade in fullscreen fixed-position DOM terminal; reverse on exit. All the Html-in-3D pain disappears exactly when interactivity matters.
- **drei `<CameraControls>`** ([docs](https://drei.docs.pmnd.rs/controls/camera-controls)) wraps [yomotsu/camera-controls](https://github.com/yomotsu/camera-controls): `setLookAt`, `fitToBox`, `lerpLookAt`, `smoothTime`, transitions return **Promises** (chain the overlay fade). Disable during scroll acts so it doesn't fight the scrub.
- [Realistic 3D monitor with reflections + HTML interface](https://dev.to/blamsa0mine/building-a-realistic-3d-monitor-with-reflections-and-html-interface-using-react-three-fiber-4dcj) — directly our office-monitor setup
- [Maxime Heckel — The Study of Shaders with R3F](https://blog.maximeheckel.com/posts/the-study-of-shaders-with-react-three-fiber/) — the reference intro for `shaderMaterial` + uniform animation (energy wall)

## 5. Performance toolkit

- [Scaling performance (R3F)](https://r3f.docs.pmnd.rs/advanced/scaling-performance) — `frameloop="demand"` + `invalidate()` (use in idle den/terminal states), `performance.regress()`, instancing, `<Detailed>` LOD
- `<Canvas dpr={[1, 2]}>` + [PerformanceMonitor](https://drei.docs.pmnd.rs/performances/performance-monitor) (start 1.5, incline→2, decline→1) + [AdaptiveDpr](https://drei.docs.pmnd.rs/performances/adaptive-dpr)
- [useKTX2](https://drei.docs.pmnd.rs/loaders/ktx2-use-ktx2) GPU-compressed textures; [gltf-transform CLI](https://gltf-transform.dev/cli) `optimize --compress meshopt` + `uastc` for the room GLB
- [r3f-perf](https://github.com/utsuboco/r3f-perf) — in-canvas fps/GPU/draw-call HUD during development

## 6. Gotchas

- **StrictMode double-effects** → duplicate ScrollTriggers; `useGSAP()` auto-reverts via `gsap.context()`. R3F 9 itself is StrictMode-safe.
- **Suspense**: `useGLTF.preload()` at module scope; toggle `visible` instead of unmounting heavy meshes (remount = shader recompile).
- **No `setState` per frame/scroll** — refs + zustand `getState()`, delta-based movement.
- **One scroll pipeline**: don't mix ScrollControls' container with Lenis/ScrollTrigger on window. Canvas stays `position: fixed`.
- **Raycast ignores occlusion**: background meshes still get pointer events — `e.stopPropagation()` up front, `raycast={() => null}` on scenery.
- **Mobile Safari**: dpr ≤ 2 (context loss risk), `dvh`/`svh` not `vh`, audio needs a user gesture.
- **TS 7**: language-compatible with 6.x; pin 6.x only if lint tooling breaks (until TS 7.1 API).
