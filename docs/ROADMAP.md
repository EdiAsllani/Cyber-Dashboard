# Roadmap

Phases are sized to end in something visibly working. Each has acceptance criteria — a phase isn't done until they pass on `docker compose up`.

## Phase 0 — Research & architecture ✅ (2026-09-03)
Deep research (docs/research/), architecture (ARCHITECTURE.md), decision log, repo bootstrap (compose blueprint, env template, gitignore).

## Phase 1 — Skeleton that runs ✅ (2026-09-03)
Scaffold `client/` (Vite + React + TS + R3F) and `server/` (ASP.NET Core 10 minimal API + EF Core + Npgsql), Dockerfiles with `dev` targets, wire compose + compose watch, Vite proxy `/api` → server.
**Accept (all verified):** `docker compose up --build --watch` → spinning red wireframe cube at :5173, `GET /api/health` returns `{ status: "breached", db: true }` through the proxy, EF `InitialCreate` migration applies to Postgres on boot, hot reload verified on both sides (client HMR without reload; server restart ≈5s).

## Phase 2 — The Blackwall journey ✅ (2026-09-03)
Scroll rig (Lenis + ScrollTrigger → zustand progress), Act 1 Blackwall, Act 2 contact spike (Glitch/CA ramp), Act 3 instanced data tunnel, Act 4 dissolve into a placeholder room shell, postFX chain with per-act presets, boot/loading screen.

**Wall redesign (2026-09-03, same day, at Edi's direction — supersedes the original noise-plane wall).** The Blackwall is no longer a domain-warped FBM plane; it is a *holographic laser lattice* (see D-09). Roughly 5.2k instanced dashed beams fill a 46-unit-deep volume the camera walks **between**, all feeding a white-hot horizon line at eye height that grows on approach until it whites out the frame. Frame cost measured 4.07 ms high / 2.77 medium / 2.46 low at 1265×720 — cheaper than the plane it replaced, because a beam is four triangles and a dash is a `fract`, where the plane paid 11 simplex evaluations per fragment across the full screen.
**Accept (all verified):** full 0→1 scroll plays all five acts as one continuous dive; frame cost flat at 9.6–10.1 ms across every act (1265×800, dpr 1, AMD Renoir iGPU — see the caveat below); quality tiers switch live via `PerformanceMonitor` with no crash or artefact; reduced-motion path drops Lenis, shake, Glitch, grain, the strobe and half the scroll length; zero React re-renders driven by a scroll frame (measured — 400 progress writes → 8 renders, all from mode flips); compiled program count constant at 12 through repeated up-and-down sweeps, so nothing recompiles mid-dive; `npm run typecheck` and `npm run build` green; verified identically through `docker compose up --build --watch`.

**dpr caveat.** The dev machine is an AMD Renoir *integrated* GPU on a dpr-1 display, i.e. below the "mid GPU" bar and unable to exercise dpr 2 at all. The full chain measures 12.0 ms high / 11.9 medium / 10.6 low at dpr 1, so the ~60 fps target holds here with headroom, and a mid-range discrete GPU has 3–5× the fill rate needed for dpr 2. Confirming 60 fps at dpr 2 needs a hi-dpi machine, and `PerformanceMonitor` covers the case where it does not hold.

## Phase 3 — The Den
Room modeling/assembly (primitives + emissive materials, optionally CC0 props), lighting pass, idle parallax, monitor hover glow, click → camera dolly → fullscreen terminal overlay with CRT frame, ESC back out. Terminal core: registry, parser, history, autocomplete, boot banners (no real services yet — mock echo commands).
**Accept:** both monitors enterable/exitable smoothly; terminal core usable with mock commands; journey → den handoff seamless.

## Phase 4 — WALLET.SYS
Wallet + budgets backend (entities, invariants, endpoints per ARCHITECTURE §5–6), seeding on first login (dev: seeded local user until Phase 5 auth lands), terminal commands wired to typed API client, themed errors (overdraft, cooldown), history table rendering.
**Accept:** pay/income/salary/history/budget lifecycle all work end-to-end and survive container restarts (data in Postgres volume); overdraft and double-salary-claim correctly refused server-side.

## Phase 5 — REPO.NET + auth
GitHub OAuth (cookie BFF), user upsert + wallet claim/merge of seed account, Octokit-backed repo endpoints with 60s cache + ETags, REPO.NET commands (repos, repo, latest, commits, prs, rate), 401 → `ACCESS DENIED` terminal flow.
**Accept:** fresh browser → `login` → real repo stats in terminal; rate limiting respected (cache hits visible in logs); logout kills session.

## Phase 6 — Polish & ship
Audio (hum, keystrokes, breach sting) behind user gesture, screen-mirror render-to-texture nice-to-have, seeded demo mode (no GitHub) for showing off, perf pass (gltf-transform, KTX2, bundle split), prod compose file (`compose.prod.yaml` via the merge convention — research 04 §5; API serves built SPA from `wwwroot` with `MapStaticAssets` + `MapFallbackToFile`), README quickstart rewrite, optional deploy target.
**Accept:** `docker compose -f docker-compose.yml -f compose.prod.yaml up` serves the whole app from one origin; cold load < 4s to boot screen on fast connection.

---

### Suggested order of risk
The novel/artistic risk is front-loaded on purpose: Phase 2 (shader journey) is the make-or-break piece; Phases 4–5 are conventional CRUD/API work we can't really fail at. If Phase 2 needs more iterations, steal time from Phase 6.

*Phase 2 postscript (2026-09-03): it landed without eating Phase 6's budget. Deviations from the plan, all deliberate and measured — tunnel streak counts are 900/550/320 rather than 2500/1200/600 (at the planned density the band renders as a solid sheet of light, whatever the radius or thickness); the camera curves are sampled with `getPoint`, not `getPointAt`, because the plan's control points were spaced for uniform parameterization and arc length dragged the pierce from t≈0.37 to t≈0.31; and the postFX chain needs three `EffectPass`es rather than one, since postprocessing refuses to merge a UV-warping effect with a convolution effect and `ChromaticAberration` is itself flagged CONVOLUTION. Phase 3 debt: none from the dissolve — `onBeforeCompile` worked, so the wireframe-crossfade fallback was not needed.*
