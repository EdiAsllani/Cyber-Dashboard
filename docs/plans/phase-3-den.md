# Phase 3 Implementation Plan — The Den

*Written 2026-09-03 for an implementing agent (Claude Code) with no prior context on this project. Read this whole document before writing code. The client (Edi) gave explicit art direction for this phase — §2 is a requirements list, not a suggestion list.*

---

## 0. Context — what this project is and where it stands

**CYBER-DASHBOARD // BLACKWALL** is a personal, non-commercial, Cyberpunk-2077-inspired 3D dashboard. Full design: [docs/ARCHITECTURE.md](../ARCHITECTURE.md) · phases: [docs/ROADMAP.md](../ROADMAP.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md) · research: [docs/research/](../research/01-frontend-3d.md) · the Phase 2 plan (worth skimming for the house style of building): [phase-2-blackwall.md](phase-2-blackwall.md).

**Phase 2 is done and accepted**, including a same-day redesign of the Blackwall into an instanced laser lattice (DECISIONS D-09). The scroll journey works end to end: boot screen → laser-field Blackwall → whiteout pierce → data tunnel → a *placeholder* room shell that dissolves in → camera freezes at a seat pose. Verified 60fps-capable, zero scroll-driven React re-renders, quality tiers, reduced-motion path.

**Phase 3 goal (from ROADMAP):** turn the placeholder shell into the real Den — a decorated cyberpunk office — and make the two monitors interactive: hover glow, click → camera zooms into the screen → a fullscreen DOM terminal with a CRT frame boots up (mock commands only; real services are Phases 4–5), ESC backs out.

**Run it:** `docker compose up --build --watch` → http://localhost:5173. Bare-metal `cd client && npm run dev` also works. Debug handles at `/?debug`: leva panel, r3f-perf, `window.__pin(p)` (pin progress without scrolling — the reliable way to screenshot), `window.__seek(p)`, `window.__journey`, `window.__gpuProbe(n)` (real GPU ms through the post chain). **The in-app browser's screenshots black out when the document is scrolled — always `__seek(0)` then `__pin(p)` before capturing.**

**Skills:** this account has `threejs-*` skills enabled. Load before the matching task: `threejs-geometry` (instancing, TubeGeometry) before Task 3, `threejs-materials` + `threejs-textures` (CanvasTexture) before Task 5, `threejs-interaction` (raycasting) before Task 7.

**Conventions:** work on a `feat/phase-3-den` branch (branch off the current `feat/phase-2-blackwall-journey` unless it has been merged to main — check). One commit per numbered task, conventional messages, end with your model's `Co-Authored-By:` line. `npm run typecheck` and `npm run build` stay green at every commit. Keep the diegetic voice in all copy (`ACCESS TERMINAL`, `DISCONNECTED`, never "Click here").

---

## 1. The non-negotiable engineering seams (read the code first)

Read these files before writing anything; they carry load-bearing comments:

- [Act5DenShell.tsx](../../client/src/scene/acts/Act5DenShell.tsx) — the component boundary Phase 3 replaces the *internals* of. Room group at world `z = -52`, room 10×10×3.2, `visible` gated at `p > 0.62`.
- [dissolveMaterial.ts](../../client/src/scene/materials/dissolveMaterial.ts) — `createDissolveMaterial(props, reveal)`. **Every new standard material in the den must be created through this and share the ONE `reveal` uniform object**, or props will pop into existence while the walls are still dissolving (reveal ramps across p 0.70–0.85).
- **Light-count rule** (comment in Act5DenShell): three.js keys shader programs on the visible light count — mounting a light mid-journey recompiles every standard material. The den currently has `ambientLight` + 2 pre-mounted point lights ramped from intensity 0. Decorations must be **emissive, not lit**: if a new real light is unavoidable, mount it from t=0 at intensity 0, same trick. Physically-correct falloff: point-light intensities are candela (the existing lamps are 40 and 10, not 1.0).
- [CameraRig.tsx](../../client/src/rig/CameraRig.tsx) — one writer owns the camera every frame. `PATH`/`LOOK` CatmullRom curves sampled with `getPoint` (uniform parameterization — control point k lands at t=k/8). In `mode === 'den'` the rig currently just breathes.
- [journey.ts](../../client/src/state/journey.ts) — the store discipline: `progress` is transient (no plain selectors), `mode`/`quality`/`reducedMotion` are normal state. `subscribeProgress()` for DOM refs.
- [useScrollRig.ts](../../client/src/rig/useScrollRig.ts) — the single scroll pipeline; boot mode locks scroll via `lenis.stop()` + body overflow. Terminal mode will reuse exactly this lock path.
- [JourneyScene.tsx](../../client/src/scene/JourneyScene.tsx) — fog is mounted once and animated (never attached mid-journey: fog flips a shader define). It tightens to near 4 / far 34 for the tunnel and currently *stays* tight — see §6.4, the den needs it relaxed.
- [PostFX.tsx](../../client/src/fx/PostFX.tsx) — bloom threshold 1.0: anything meant to glow outputs HDR values > 1 with `toneMapped: false`; everything else must stay below 1 or the frame blooms uniformly.

---

## 2. Client requirements (Edi's art direction — all REQUIRED)

1. **The seat pose gets closer to the monitors.** The journey's final camera pose moves in so the screens dominate the view (current end: `(0, 1.4, -50)` looking at `(0, 1.35, -52.5)` — roughly 3m from the screens; bring it to ~1.6m, spec in §4).
2. **The room reads as a real office**, decorated:
   - **Ventilation tubes** along the ceiling (with elbows and hanging brackets).
   - **Wires/cables on the walls** — sagging bundles, some running from desk to floor to wall.
   - **Neon signs with game quotes.** `TIME TO GO KLEPPING` is required verbatim; add 1–2 more short lines from the game's world, e.g. `WE HAVE A CITY TO BURN`, `NEVER FADE AWAY`, `NO FUTURE`. Keep each quote short (a few words); this is a non-commercial fan work (see README disclaimer) — short quotes on props are the safe lane, and no game logos/logotypes.
3. **Monitors: bigger, offset, on arms.** Both screens larger than the current 0.6×0.375; the right one mounted **a little higher** than the left; **more horizontal distance between them**; each on a **visible monitor arm** (clamp post + articulated segments + VESA plate) attached to the desk — no floating bezels.
4. **Keyboard and mouse** on the desk.
5. **An Airhypo on the table** (the CP2077 injector item).
6. **The Malorian Arms 3516 on the other side of the table** (Johnny Silverhand's pistol).
   - For 5 and 6: **WebSearch the Cyberpunk wiki (cyberpunk.fandom.com) for reference images** — "Airhypo cyberpunk wiki", "Malorian Arms 3516 wiki" — study the silhouette, then **build primitive homages** (boxes/cylinders, 10–25 prims each). Do NOT download fan-made models or rip textures: D-05 is primitives-first and fan-made models of trademarked designs are license-murky. A recognizable silhouette at desk scale is the bar, not gun-store accuracy.
7. **Both monitor screens idle with `INTERLINKED` in big text** and log-style lines scrolling beneath — the Blade-Runner-baseline feel (spec in §5).

---

## 3. Store & mode changes (Task 1)

Extend [journey.ts](../../client/src/state/journey.ts):

```ts
export type Mode = 'boot' | 'journey' | 'den' | 'terminal'
export type MonitorSide = 'left' | 'right'

// new state
focused: MonitorSide | null          // which monitor the camera is locked to
focusMonitor: (side: MonitorSide) => void  // den -> terminal (guard: only from 'den')
blurMonitor: () => void                    // terminal -> den
```

- `enterDen`/`exitDen` guards unchanged, but `exitDen` must be impossible while `mode === 'terminal'` (the scroll lock below already prevents it; keep the guard anyway).
- **Scroll lock:** in `useScrollRig`, the boot lock effect becomes `const locked = mode === 'boot' || mode === 'terminal'`. The existing lock already does `lenis.stop()` + `overflow: hidden` + `ScrollTrigger.refresh()` on release — reuse it verbatim. One subtlety: the boot branch also does `window.scrollTo(0, 0)` — that must NOT happen for the terminal lock (guard it on `mode === 'boot'`), or opening a terminal teleports the journey back to t=0.
- HUD: `mode === 'terminal'` hides the HUD entirely (the overlay owns the screen); `den` keeps the existing dimmed state.

## 4. Camera (Task 1, verified in Task 7)

### 4.1 Closer seat pose
In [CameraRig.tsx](../../client/src/rig/CameraRig.tsx), move the last control points:

```ts
// PATH end:  (0, 1.5, -47) stays,  final (0, 1.4, -50)  →  (0, 1.34, -51.55)
// LOOK end:  last two points       →  (0, 1.30, -53.05)  (the monitor midpoint)
```

`getPoint` is uniform parameterization, so pulling the final point closer changes late-curve speed — re-verify the arrival still decelerates smoothly and nothing clips through the desk (desk front edge is at world z ≈ -52.55 after the §5 rebuild; camera at -51.55 leaves ~1m).

### 4.2 Den pose machine (replaces the freeze)
The rig stays the **only** camera writer in every mode — do not introduce drei `CameraControls`; it would fight the rig (this deviates from ARCHITECTURE §2.2's suggestion — log it as D-10 in DECISIONS.md, three lines on why: one writer, no orbit wanted, damp is enough).

```ts
type DenPose = { pos: Vector3; look: Vector3 }
// SEAT:        pos (0, 1.34, -51.55)         look (0, 1.30, -53.05)
// ZOOM_LEFT:   0.52m in front of the left screen center, along its normal, look at screen center
// ZOOM_RIGHT:  same for the right screen
```

- In `den`/`terminal` modes, damp toward the active pose: `damp(current, target, 4.5, dt)` per component (reuse the existing `DAMP_LAMBDA` pattern; a slightly lower lambda ≈ 4.5 gives the ~0.8s dolly feel).
- **Pointer parallax in SEAT pose only:** pointer NDC → offset `pos.x ± 0.06`, `pos.y ± 0.03`, `look.x ± 0.04`, damped. Zero when `reducedMotion`. (Read pointer from `useThree((s) => s.pointer)` inside the same `useFrame` — no event listeners needed.)
- **Arrival signal:** when `mode === 'terminal'` and `camera.position.distanceTo(target) < 0.04`, flip a transient store flag `arrived: true` (set false on every focus/blur change). The DOM overlay fades in on `arrived`, not on a timer — timers drift from damp under low fps.
- Zoom poses derive from the monitor transforms — export monitor placement constants from a shared module (§5.2) so the rig and the scene cannot drift apart.

## 5. The room build (Tasks 2–6) — all inside the existing `Act5DenShell` boundary

Restructure `scene/acts/Act5DenShell.tsx` into a `scene/den/` folder; the act file keeps the reveal uniform, lights, group gate and simply composes:

```
scene/den/
├── constants.ts        # every coordinate below lives here, exported
├── DenRoom.tsx         # shell: floor/walls/ceiling + neon trim (exists, keep)
├── Desk.tsx            # desk, monitor arms, monitors, keyboard, mouse, desk cables
├── MonitorScreens.tsx  # screen meshes + idle CanvasTexture + hover/click handlers
├── Props.tsx           # airhypo, malorian, mug, shards/papers clutter
├── Decor.tsx           # vents, wall wires, server rack, posters
├── NeonSigns.tsx       # quote signs (drei Text)
└── screenFeed.ts       # the INTERLINKED + log canvas painter (pure, testable)
```

All positions below are **local to the den group** (world = local + `z -52`). Sizes in meters.

### 5.1 Desk (Task 3)
- Top `2.8 × 0.06 × 1.0` at `y 0.78`, center `z -1.05` (front edge local -0.55). Two side slab legs + a back modesty panel (reuse the desk material). A cable tray box under the rear edge.
- **Keyboard:** base `0.44 × 0.018 × 0.15` at `(−0.12, 0.79, −0.72)`, yawed ~0.05. Keycaps: ONE `InstancedMesh` of ~62 small boxes (`0.016³`, 5 rows) laid out in `useLayoutEffect`; material slightly lighter than the desk, plus a thin emissive red underglow strip on the base's front edge (HDR ~1.4).
- **Mouse:** flattened capsule (`sphereGeometry` scaled `[0.03, 0.018, 0.055]`) at `(0.28, 0.795, −0.70)` with a 1px emissive DPI dot.
- **Monitor arms (required, per monitor):** clamp block on the desk rear edge → vertical post (cylinder r 0.018) → lower arm segment → elbow (small sphere) → upper segment → VESA plate box behind the bezel. Angle the segments so the silhouette clearly reads "articulated arm", not "pole".

### 5.2 Monitors (Task 3 + 5) — bigger, offset, one higher
Export from `constants.ts` (the camera rig consumes these too):

```ts
export const MONITORS = {
  left:  { screen: [0.82, 0.46], center: [-0.56, 1.30, -1.34], yaw:  0.11 },
  right: { screen: [0.74, 0.42], center: [ 0.58, 1.42, -1.32], yaw: -0.13 },
} as const
// inner-edge gap ≈ 0.36 m; right sits 0.12 higher (per the brief)
```

- Bezel box `screen + 0.05` each dimension, depth 0.045; screen plane 2mm proud of the bezel. Both yawed toward the seat.
- Screen material: `createDissolveMaterial` with `emissiveMap` = the CanvasTexture (§5.3), `emissive: '#ffffff'`, `emissiveIntensity ~1.15`, `toneMapped: false`, near-black base color. Keep average emitted values *under* the bloom threshold — only the INTERLINKED title text is painted hot (see below).

### 5.3 Screen idle feed — `INTERLINKED` (Task 5)
`screenFeed.ts` exposes `createScreenFeed(seed): { canvas, tick(now): boolean }`:

- Canvas `1024 × 576`. Layout: top 42% = `INTERLINKED` in huge Rajdhani caps (fillStyle a hot pink-white, e.g. `#ff9db4` — the emissiveIntensity pushes it over the bloom threshold so the title glows and the logs don't), thin rule, bottom = 11–13 monospace log lines.
- Log lines are generated flavor, timestamped, new line every 0.8–1.6s, old lines scroll up; palette `#e8e8e8` at 0.75 alpha with occasional `#ff003c` WARN lines. Sample pool (write ~20 variants):
  `[04:22:17] relic.sys :: handshake OK`, `cortex/daemon spawned (pid 2077)`, `WARN ice_probe blocked @ 4th ring`, `cells. within cells. interlinked.`, `synapse bridge stable — 62ms`.
- `tick(now)` repaints at most at 5 Hz (2 Hz on `low` quality) and returns whether it painted → caller sets `texture.needsUpdate = true` only then. Different `seed` per monitor so the two screens don't mirror.
- Texture: `THREE.CanvasTexture`, `colorSpace = SRGBColorSpace`, `anisotropy 4`. Stop ticking entirely while `mode === 'terminal'` (overlay covers the scene) and when the den group is invisible.
- Subtle life: multiply a per-frame flicker `0.96 + 0.04 * hash(floor(t*24))` onto `emissiveIntensity` (skip when `reducedMotion`).

### 5.4 Props (Task 4) — wiki-referenced primitive homages
- **Airhypo** at `(-0.62, 0.80, -0.85)`, lying at a lazy angle: pistol-grip injector — main body cylinder (r 0.012, len 0.09), angled grip box, nozzle cone, small transparent-ish canister (thin cylinder, `#03d8f3` emissive tint at ~0.6 — the one allowed cyan accent), red cross decal via a tiny emissive box. ~12 prims.
- **Malorian Arms 3516** at `(0.86, 0.795, -0.95)`, lying flat, muzzle pointed AWAY from the seat: long flat-topped slide (box), skeletal grip with exposed spine (two thin boxes + gap), the signature wide muzzle/compensator block, protruding hammer/actuator prongs at the rear, trigger guard from a squashed torus segment. Dark gunmetal (`metalness 0.75, roughness 0.35`) with one thin emissive red seam line along the slide. ~20 prims. Study 2–3 wiki/screenshot references first; the silhouette (long, flat, angular, rear prongs) is what sells it.
- **Clutter:** coffee mug (open cylinder + torus handle), a leaning stack of 3 "shards" (thin rounded boxes, one with a tiny emissive edge), 2 loose papers (planes, slight rotations), all on the desk's far ends.

### 5.5 Decor (Task 6)
- **Ceiling vents (required):** two duct runs (cylinders r 0.14) crossing the ceiling at different heights (`y 2.95` and `2.82`), each with a 90° elbow (torus arc segment) dropping into a wall, hanging brackets (thin boxes) every ~1.5m, one square diffuser box with slit grills (3 thin dark slats). Matte metal: `#161616, metalness 0.5, roughness 0.6`.
- **Wall wires (required):** 4–6 cable runs as `TubeGeometry` over `CatmullRomCurve3` points — sagging catenary-ish spans between wall anchor points (small box clips at each anchor), one bundle dropping from the desk cable tray to the floor and along the baseboard. Radii 0.008–0.015. One cable is emissive red at intensity ~1.3 and slowly pulses (`emissiveIntensity = 1.0 + 0.5 * sin(t * 1.7)` in the act's existing useFrame — no new component loops).
- **Server rack** in the back-left corner `(-4.0, 0, -3.8)`: cabinet `0.6 × 1.9 × 0.7`, 5 inset unit faces, and ONE `InstancedMesh` of ~72 LED studs on the faces. LED colors via `setColorAt` (85% red family, 15% cyan); blink by rewriting ~8 random instance colors at 3 Hz from the act's useFrame (cheap: `instanceColor.needsUpdate` on a 72-length buffer).
- **Posters:** 2 unlit dark planes with thin emissive borders on the side walls (no imagery needed — frames + a faint emissive glyph rectangle read fine at this distance).

### 5.6 Neon quote signs (Task 6) — drei `<Text>`
- Font files: download `Rajdhani-SemiBold.ttf` and `ShareTechMono-Regular.ttf` from the google/fonts GitHub repo (both SIL OFL) into `client/public/fonts/` and commit an `OFL.txt` alongside. Pass via `font="/fonts/Rajdhani-SemiBold.ttf"` — troika needs a real font URL, it cannot use the Google Fonts CSS the DOM uses.
- Three signs, wall-mounted with a visible dark backing plate + two standoff pins each:
  - Back wall, above the monitors: **`TIME TO GO KLEPPING`** (required), width ~2.2.
  - Left wall: `WE HAVE A CITY TO BURN`, slightly smaller.
  - Right wall, vertical stack or small: `NEVER FADE AWAY` (or `NO FUTURE` as the graffiti-style odd one out, rotated 2–3°).
- Neon look: `color={new THREE.Color(2.6, 0.05, 0.6)}` (HDR → bloom), `material-toneMapped={false}`, `outlineWidth ~0.004` with a dimmer outline color for the tube body. One sign flickers: drop its `fillOpacity` to 0.35 for 2–3 frames on a hash lottery (`hash(floor(t*13)) > 0.93`), skip when `reducedMotion`.
- **Dissolve caveat:** troika's material can't take the `createDissolveMaterial` patch. Fade signs in with `fillOpacity = reveal.value` (and outline opacity likewise) driven from the act's useFrame — they fade while the room dissolves, which reads fine.

### 5.7 Fog & light adjustment (Task 2)
The tunnel fog (near 4 / far 34) currently persists into the den and would smother the back wall. In [JourneyScene.tsx](../../client/src/scene/JourneyScene.tsx), add a second ramp: across p 0.85→0.97 relax fog to `near 10 / far 80`. Same lerp pattern that's already there; verify the tunnel exit still hides behind the act-4 dissolve.
Lighting stays: ambient + the 2 existing pre-mounted lamps (retune intensities/positions to flatter the new desk — the desk lamp should rake across the keyboard). Everything else glows via emissive.

## 6. Interaction: hover → zoom → terminal (Task 7)

### 6.1 Hover (mode `den` only)
- Only the two screen meshes are raycastable (the codebase already sets `raycast={() => null}` on scenery — extend that to every new mesh EXCEPT the screens; the desk group is dense, so this matters for raycast cost too).
- `onPointerOver`: boost that screen's `emissiveIntensity` +0.35, set `document.body.style.cursor = 'pointer'`, and show a HUD hint line `ACCESS TERMINAL //` + side. `onPointerOut` reverts. `e.stopPropagation()` in both.
- Guard every handler on `useJourney.getState().mode === 'den'` — pointer events still fire during the journey flythrough.

### 6.2 Click → zoom → overlay
1. Click screen → `focusMonitor(side)` → mode `terminal`, scroll locks (§3), HUD hides.
2. CameraRig damps to `ZOOM_<SIDE>` (§4.2); on `arrived`, the DOM overlay fades in (250ms CSS).
3. ESC key or the overlay's `[ DISCONNECT ]` button → overlay fades out (200ms) → `blurMonitor()` → camera damps back to SEAT → scroll unlocks. ESC listener lives in the overlay component (mounted only in terminal mode → no global listener leaks).
4. Repeatable: left → out → right → out, forever, no drift (verify the SEAT pose is re-derived, not accumulated).

### 6.3 Terminal overlay + CRT frame (`ui/TerminalOverlay.tsx`)
- Fullscreen fixed DOM, `z-index` between the HUD and the boot screen. Structure: dark vignette backdrop → centered CRT bezel frame (max-width ~min(92vw, 1100px), 4:3-ish) → terminal viewport inside.
- CRT styling, pure CSS: rounded corners, inset shadow, scanlines (`repeating-linear-gradient` 3px), a slow phosphor flicker on a `::after` (skip via the existing reduced-motion CSS attribute), text glow `text-shadow: 0 0 6px currentColor`. Reuse `--hot-red`/`--ghost` custom properties; **Share Tech Mono** for all terminal text.
- Header bar: `ARASAKA TRUST // WALLET.SYS` (left monitor) or `NIGHT CITY NET // REPO.NET` (right), plus `[ DISCONNECT ]`.

## 7. Terminal core, mock edition (Task 8) — the seam Phases 4–5 fill

```
terminal/
├── types.ts        # Command, TerminalLine, TerminalSkin
├── registry.ts     # createRegistry(commands): parse + complete + run
├── useTerminal.ts  # history, input state, ↑/↓ recall, Tab completion, output buffer (cap 200 lines)
├── Terminal.tsx    # renderer: output lines, prompt, blinking block cursor
└── skins/
    ├── wallet.ts   # banner + prompt "wallet>" + mock commands
    └── repo.ts     # banner + prompt "net>"    + mock commands
```

- **Command shape** (this is D-03's registry — Phase 4 swaps handlers for API calls, nothing else):
  `{ name, args: string, help, run(argv, ctx): Promise<TerminalLine[]> | TerminalLine[] }`
- Mock commands, both skins: `help` (from the registry, aligned columns), `clear`, `whoami` (`edi // netrunner-1`), `echo`, `status` (fake uptime + the real `/api/health` fetch — the one allowed API call, it already exists), plus per-skin flavor: wallet `balance` → `€$ 2,077.00 [MOCK — Phase 4]`; repo `repos` → `ACCESS DENIED — link GitHub in Phase 5`.
- Unknown command → `COMMAND NOT RECOGNIZED: <input>` with the HUD's glitch CSS class. `↑/↓` history (persist per-skin in memory only), `Tab` completes command names (common-prefix, list on double-Tab). Boot: 4–5 banner lines typed at ~20ms/char (instant when `reducedMotion`), then the prompt. Input is a real hidden `<input>` focused on mount and on any click inside the frame (IME/paste for free); render its value into the styled line.
- Ambition guard: no PTY, no xterm (D-07), no scrollback virtualization — 200-line cap and CSS `overflow-y: auto`.

## 8. Quality tiers & reduced motion (Task 9)

| Tier | LED studs | Cable tube segments | Screen feed Hz | Keycaps | Vents segments |
|---|---|---|---|---|---|
| high | 72, 3 Hz blink | 48 | 5 | full | 24 |
| medium | 48, 2 Hz | 28 | 4 | full | 16 |
| low | 24, 1 Hz | 16 | 2 | merged single box + texture-less | 10 |

Reduced motion: no pointer parallax, no sign/screen flicker, camera transitions still damp (motion between poses is meaning, not decoration — but drop the lambda to land faster), terminal types instantly.

## 9. Task order & verification (each task = one commit)

| # | Task | Verify before committing |
|---|---|---|
| 1 | Store modes + scroll lock + camera poses/parallax/closer seat | `__pin(1)` → seat is visibly closer, screens dominate; leva-flip mode to terminal → scroll locked, no `scrollTo(0,0)` teleport; StrictMode/HMR clean |
| 2 | `scene/den/` restructure + fog relax + light retune | journey → den unchanged visually vs before (screenshot diff), fog no longer smothers the back wall, program count unchanged after the dive (`__gpuProbe` reports `programs`) |
| 3 | Desk v2, arms, bigger offset monitors, keyboard, mouse | wide + seat screenshots; arms read as arms; right monitor visibly higher; no z-fighting |
| 4 | Props: airhypo, malorian, clutter | close-up screenshots of both props; silhouettes recognizable; muzzle points away |
| 5 | Screen feed: INTERLINKED + logs | title glows (bloom), logs legible from seat, both screens differ; feed pauses in terminal mode; ≤5 Hz repaint confirmed via a counter |
| 6 | Vents, wires, neon quote signs, rack, posters | wide shot: room reads "office"; `TIME TO GO KLEPPING` present; signs fade with dissolve; LED blink visible |
| 7 | Hover/click/zoom/overlay/ESC | full loop both monitors ×3; hover glow + cursor; overlay waits for `arrived`; scroll-up in den (not terminal) still exits to journey |
| 8 | Terminal core + skins | type/history/Tab/clear/unknown-command all work in both skins; `status` hits `/api/health` through the proxy |
| 9 | Tiers + reduced motion + perf + acceptance + docs | checklist below; update ROADMAP (Phase 3 ✅ + evidence), DECISIONS (log D-10), README status line |

### Acceptance checklist (all must pass)
1. Landing pose is the closer one; `INTERLINKED` is legible from the seat on both screens.
2. Every §2 requirement present — walk the list literally, screenshot each: vents, wall wires, ≥3 neon quote signs incl. the required one, bigger/offset/armed monitors, keyboard+mouse, airhypo, malorian.
3. Hover glow + pointer cursor; click → ~0.8s dolly → CRT terminal; ESC returns; repeatable on both monitors with no camera drift.
4. Scroll locked in terminal; den → journey scroll-up exit still works; journey → den → journey ×3 with no pops (dissolve covers ALL new props — watch for anything appearing after the walls).
5. Zero scroll-driven React re-renders (the render-probe pattern already in the codebase); no shader recompiles after the dive (constant program count across den entry, monitor zoom, terminal open).
6. Perf on the dev machine (`__gpuProbe(40)` at `__pin(1)`): den frame ≤ 6ms at 1265×720 high tier; draw calls in den < 160 (instancing did its job).
7. `npm run typecheck` + `npm run build` green; verified through `docker compose up --build --watch`; reduced-motion pass (leva toggle): no parallax/flicker, instant terminal type-in.
8. Screenshot evidence in the final report: seat pose, hover state, mid-dolly, each terminal open, wide decorated-room shot, one prop close-up each.

## 10. Known traps (learned in Phases 1–2 — read twice)

1. **One `reveal` uniform.** Every dissolve material shares the single uniform object. A second object = props that pop. Troika Text can't take the patch — fade `fillOpacity` from the same `reveal.value`.
2. **Light count is a shader define.** No new lights after t=0 unless pre-mounted at intensity 0. Emissive-first decorating.
3. **Fog is mounted once, animated always** — extend the existing lerp, never `attach`/detach fog.
4. **Bloom threshold is exactly 1.0** — glow needs HDR values (>1) with `toneMapped: false`; the screen feed's log text must stay below it or the whole screen blooms into an unreadable smear.
5. **`pow(negative, x)` in any new shader = NaN** = a black frame via bloom's mipmap chain (bit us in Phase 2 — clamp bases).
6. **One camera writer.** The rig owns every mode. No CameraControls, no gsap tweens on the camera — poses + damp only.
7. **Raycast discipline:** every new mesh gets `raycast={() => null}` except the two screens; guard handlers on mode; `stopPropagation`.
8. **Store discipline:** `progress` stays transient; `focused`/`arrived` change rarely and are fine as selectors — but drive per-frame visuals (emissive boosts, flicker) inside `useFrame` via `getState()`.
9. **In-app browser screenshots black out when the document is scrolled** — `__seek(0)` + `__pin(p)` before every capture.
10. **CanvasTexture:** `needsUpdate` only on actual repaint; `SRGBColorSpace`; kill the feed interval on unmount (StrictMode runs effects twice).
11. **`window.scrollTo(0,0)` belongs to the boot lock only** — reused blindly for the terminal lock it resets the whole journey (§3).
12. **Wiki images are reference only** — primitive homages, no ripped assets/textures/logos (CDPR fan-content rules, research 02 §5–6).
13. **Uniform curve parameterization:** moving PATH's last control point shifts late-curve speed — re-check the arrival, don't trust the old feel.
