# Roadmap

Phases are sized to end in something visibly working. Each has acceptance criteria — a phase isn't done until they pass on `docker compose up`.

## Phase 0 — Research & architecture ✅ (2026-09-03)
Deep research (docs/research/), architecture (ARCHITECTURE.md), decision log, repo bootstrap (compose blueprint, env template, gitignore).

## Phase 1 — Skeleton that runs
Scaffold `client/` (Vite + React + TS + R3F) and `server/` (ASP.NET Core 10 minimal API + EF Core + Npgsql), Dockerfiles with `dev` targets, wire compose + compose watch, Vite proxy `/api` → server.
**Accept:** `docker compose up --build --watch` → spinning red wireframe cube at :5173, `GET /api/health` returns `{ status: "breached" }` through the proxy, EF migration applies to Postgres on boot, hot reload works on both sides.

## Phase 2 — The Blackwall journey
Scroll rig (Lenis + ScrollTrigger → zustand progress), Act 1 Blackwall shader plane (FBM noise, red bands, filaments), Act 2 contact spike (Glitch/CA ramp), Act 3 instanced data tunnel, Act 4 dissolve into a placeholder room shell, postFX chain with per-act presets, boot/loading screen.
**Accept:** full 0→1 scroll plays all acts at 60fps on a mid GPU, quality tiers switch via PerformanceMonitor, reduced-motion fallback path exists.

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
