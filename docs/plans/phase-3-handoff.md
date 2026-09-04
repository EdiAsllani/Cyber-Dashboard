# Phase 3 handoff — paused mid-Task 6

> **Resolved 2026-09-04:** Tasks 6–9 were completed by a second run. Phase 3 is
> done — see the ROADMAP's Phase 3 entry for the acceptance evidence and the
> perf caveat. This file stays as the record of the pause, not as work to do.

*Written 2026-09-03 when Edi paused the implementation run. Branch: `feat/phase-3-den` (branched off `feat/phase-2-blackwall-journey`, which is still not merged to `main`). Everything below is pushed to `origin`.*

Read [phase-3-den.md](phase-3-den.md) first — it is still the spec, and nothing in it has been superseded. This file only says **where the work stopped** and **what the next agent needs to know that isn't in the plan**.

---

## 1. Status by task

| # | Task | State |
|---|------|-------|
| 1 | Store modes + scroll lock + camera poses/parallax/closer seat | ✅ committed, verified |
| 2 | `scene/den/` restructure + fog relax + light retune | ✅ committed, verified |
| 3 | Desk v2, arms, bigger offset monitors, keyboard, mouse | ✅ committed, verified |
| 4 | Props: airhypo, malorian, clutter | ✅ committed, verified |
| 5 | Screen feed: INTERLINKED + logs | ✅ committed, verified |
| 6 | Vents, wires, neon quote signs, rack, posters | 🟡 **half-built, committed as WIP, NOT wired in and NOT verified** |
| 7 | Hover/click/zoom/overlay/ESC | ⬜ not started |
| 8 | Terminal core + skins | ⬜ not started |
| 9 | Tiers + reduced motion + perf + acceptance + docs | ⬜ not started |

Commits, oldest first:

```
feat(client): terminal mode, den pose machine, closer seat        (Task 1)
refactor(client): split the den into scene/den, relax the fog...  (Task 2)
feat(client): desk v2 — bigger offset monitors on a real arm...   (Task 3)
feat(client): desk props — airhypo, Malorian 3516, and clutter    (Task 4)
feat(client): INTERLINKED — the monitors' idle canvas feed        (Task 5)
wip(client): den decor and neon signs — built, not wired in       (Task 6, partial)
```

`npm run typecheck` and `npm run build` are green at every one of them, including the WIP commit.

## 2. Exactly where Task 6 stopped

**Written and committed, compiling, but not referenced by anything yet:**

- `client/public/fonts/` — `Rajdhani-SemiBold.ttf`, `ShareTechMono-Regular.ttf`, and both SIL OFL licences (`OFL-Rajdhani.txt`, `OFL-ShareTechMono.txt`). Fetched from the `google/fonts` repo as the plan §5.6 specifies. Troika needs a real font-file URL; it cannot use the Google Fonts CSS the DOM side loads.
- `scene/den/Tubing.tsx` — `Bend` (quadratic Bézier elbow), `Cable` (Catmull-Rom tube), `sagged()` (two anchors + a catenary-ish belly), and `TUBE_SEGMENTS` per tier.
- `scene/den/Decor.tsx` — two crossing ceiling ducts with elbows, an instanced set of 12 hanger straps, a slotted diffuser box over the desk, six cable runs (five wall spans plus the tray → floor → baseboard bundle), the back-left server rack with an instanced LED array, and two posters.
- `scene/den/NeonSigns.tsx` — the three signs (`TIME TO GO KLEPPING` required and present verbatim, `WE HAVE A CITY TO BURN`, `NO FUTURE`), each with a backing plate and two standoff pins, plus `useNeonSigns()` exposing a `tick(reveal, now, reducedMotion)`.
- `scene/den/materials.ts` — new `cableHot` material for the one live cable run.
- `scene/materials/dissolveMaterial.ts` — **the one change here that is not decoration**: the vertex patch now has a `#ifdef USE_INSTANCING` branch that multiplies by `instanceMatrix`. three applies the instance matrix later, in `<project_vertex>`, so the old code gave every instance of a mesh the same world position and therefore the same noise sample — the 62 keycaps (and, once wired, the 72 rack LEDs) revealed as one block at a single threshold instead of burning in with the surface under them. This affects Task 3's keyboard too, so it is worth keeping regardless of what happens to the decor.

**Not done, to finish Task 6:**

1. Mount `<Decor>` and `<NeonSigns>` inside the den group in `scene/acts/Act5DenShell.tsx`. Both are designed to be driven from the act's existing single useFrame (see §4 below), so the act needs:
   - `const leds = useRef<InstancedMesh>(null)` passed to `<Decor leds={leds} quality={quality} />`
   - `const signs = useNeonSigns()`, `<NeonSigns mats={mats} signs={signs} />`, and `signs.tick(reveal.value, elapsed, reducedMotion)` in the frame callback
   - the hot cable pulse: `mats.cableHot.emissiveIntensity = 1.0 + 0.5 * Math.sin(t * 1.7)`
   - the LED blink: rewrite ~8 random instance colours at 3 Hz (2 Hz medium, 1 Hz low) and set `instanceColor.needsUpdate`
2. Verify: wide shot reads "office"; `TIME TO GO KLEPPING` legible; signs fade with the dissolve (they cannot dissolve — troika's material can't take the patch, so `fillOpacity`/`outlineOpacity` are driven from the same `reveal` value); LED blink visible; **draw calls still under 160** (see §5 — the estimate says ~133, but it has not been measured).
3. Amend or replace the WIP commit with a real `feat(client):` commit once it is wired and verified.

## 3. Deviations from the plan so far (all deliberate, all verified)

- **Monitor arms are one central dual arm, not one arm per monitor.** The plan's per-monitor clamp is what a real arm looks like and is therefore invisible from the seat: a monitor hides its own mount. The post now stands in the 0.36 m gap between the screens — the one part of the mount the camera looks straight at — and the two branches leave it at different heights, which is what makes the 0.12 m height offset legible. `armBranch(side)` in `constants.ts` replaced the plan's `armChain`.
- **`DESK_SURFACE` is derived, not typed.** The plan's prop heights (0.79, 0.795, 0.80) sit at the desk slab's *centre* height, which would sink the keyboard and mouse halfway into it. Props are placed relative to `DESK.y + DESK.top[1] / 2` (0.81).
- **The Malorian's hot seam lives on the -Z face.** The gun is rolled onto its side so its profile faces up, and `Rx(90°)` maps -Z to +Y — on +Z the seam pointed into the desk.
- **Gunmetal is lighter than a real finish** (`#4a4e55`). The right half of the desk is outside the desk lamp's reach and a true gunmetal prop was a black shape in a black room.
- **Screen material is matte** (roughness 0.6, was 0.25). A small light square-on to a glossy screen puts a specular hotspot down the camera's barrel and bloom turns it into a blown-out blob.
- **Fog relax is a nested pair of lerps on one node**, not a second fog. Same node, two ramps: open → tight for the tunnel (0.38–0.48), tight → room (0.85–0.97).
- **`POSE_LAMBDA_REDUCED` is *higher*, not lower.** The plan says "drop the lambda to land faster" under reduced motion; in `MathUtils.damp` a higher lambda is faster, and landing faster is clearly the intent.
- **D-10 has not been written to DECISIONS.md yet.** Task 9 owns the docs pass. The code already honours it: the rig is the only camera writer in every mode, there is no `CameraControls`, and the den is a pose machine.

## 4. House rules this phase has added (don't break these)

- **The den has exactly one `useFrame`,** in `Act5DenShell`. Every animated decoration is a function of `progress` and `elapsedTime`, so a dozen decorations do not need a dozen callbacks and a dozen `getState()` reads. The pattern for a subsystem that needs per-frame work is `useMonitorScreens` / `useNeonSigns`: a hook that owns the objects and returns a `tick`, which the act calls.
- **`useDenMaterials` is the only place a den material may be born,** because the one thing that must never happen is a second `reveal` uniform object.
- **`useSceneryRaycast` (`scene/den/raycast.ts`)** walks the den group once and makes everything unhittable except objects flagged `userData.interactive` — which is currently only the two screen planes. Task 7's handlers go on those; nothing else needs a `raycast` prop.
- **Instance repeated parts for draw calls, not for triangles.** The den's budget is under 160 draw calls and a dozen separate bracket meshes is a dozen of them.

## 5. Numbers measured so far (dev machine, 1265×720, high tier, dpr 1)

| Point | Value |
|---|---|
| Den frame cost, seat pose | 4.3 ms (Task 2) → 5.1 ms (Task 3) |
| Draw calls in the den | 59 (Task 3) → 99 (Task 4, props are individual meshes) |
| Compiled programs | 14 before the den has ever been visible, 16 after, then constant across three full up-and-down sweeps |
| Screen feed repaints | 2.6 Hz high / 2.7 Hz medium / 1.9 Hz low; 0 in terminal mode; 0 while the den is hidden |
| Camera poses | seat lands at (0, 1.33, -51.55); both zoom poses land within 2 mm of the derived targets; left→out→right→out→left→out returns to z -51.55 with no drift |

**The draw-call budget is the thing to watch.** 99 before any decor, and Task 6 adds an estimated ~30 with everything instanced as designed. Measure it (`__gpuProbe`, and note the caveat in §6) before adding anything else per-mesh.

## 6. Verification tooling added this phase, and how to actually use it

The in-app browser is awkward for this project and three of these exist only because of that:

- **`window.__advance(frames, stepMs)`** (`ui/DebugBridge.tsx`) — steps r3f's frame loop by hand. **The browser pane only paints while it is on screen**, so `requestAnimationFrame` sits at *zero frames* during a headless check and every damped transition looks frozen. Note that the timestamp handed to `advance` only feeds r3f's bookkeeping: `useFrame` deltas come from `clock.getDelta()`, which reads the wall clock, so `__advance` winds `clock.oldTime` back by `stepMs` to make each frame *see* the step it was asked for.
- **`window.__r3f`** is now live getters, not a snapshot. r3f can swap the default camera when the `<Canvas camera={...}>` prop object changes identity, and a captured reference then reports the position of an orphan nothing writes — which reads exactly like a frozen render loop. That cost an hour.
- **`window.__cam(px,py,pz,tx,ty,tz)` / `window.__camUnlock()`** — parks the camera for prop close-ups. The rig is the only camera writer, which also means nothing else can look at anything; this is that hole, gated behind `?debug`.
- **`window.__feedPaints`** — the screen feed's repaint counter (debug builds only).
- **`__gpuProbe(n).drawCalls` is cumulative over the probe's frames**, not per frame. Divide by `n + 1`. `msPerFrame` and `programs` are per frame / absolute as you'd expect.
- **Practical capture recipe:** `browser_batch` with a screenshot action *first* (that is what makes the pane paint and lets r3f mount at all), then the JS, then the real screenshot. State set from JS needs an `await` before reading anything a React *effect* owns (the scroll lock, for instance) — effects don't flush inside a synchronous block.
- The den is only entered by the scroll trigger at progress > 0.997, so `__pin(1)` alone leaves `mode` at `journey`. Pin *and* `__journey.setState({ mode: 'den' })`, or use the new leva `mode` / `focused` dropdowns.

**Do not run bare `npx prettier` in this repo.** There is no prettier config, so the defaults (double quotes, semicolons, 80 columns) rewrite files away from the house style. It happened once to `Props.tsx`; the recovery is `npx prettier --no-semi --single-quote --print-width 92`.

## 7. Resuming

```bash
git switch feat/phase-3-den
docker compose up --build --watch      # already what was used; compose watch syncs client/ live
# http://localhost:5173/?debug
```

Pick up at §2's "Not done" list, then Tasks 7–9 straight from [phase-3-den.md](phase-3-den.md) — its §6, §7, §8 and §9 are untouched and still accurate. Task 9 still owns: quality tiers for the new geometry, the reduced-motion pass, the acceptance checklist, D-10 in DECISIONS.md, the ROADMAP Phase 3 entry, and the README status line.
