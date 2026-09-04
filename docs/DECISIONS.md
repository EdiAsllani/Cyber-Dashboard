# Decision log (ADR-lite)

Statuses: ✅ decided · 🟡 proposed (awaiting Edi) · ⬜ later

| # | Decision | Status |
|---|----------|--------|
| D-01 | three.js via **react-three-fiber**, not vanilla three | ✅ |
| D-02 | GitHub access: OAuth App with `read:user` + `repo` scope | ✅ |
| D-03 | Terminal commands parsed **client-side** → typed REST endpoints | 🟡 |
| D-04 | Scroll rig: **GSAP ScrollTrigger + Lenis**, not drei ScrollControls | ✅ |
| D-05 | Room built from **primitives + emissive materials**, CC0 props optional | 🟡 |
| D-06 | **GitHub OAuth is the only login**; wallet data keyed to that identity | ✅ |
| D-07 | Terminal UI: **custom React component**, not xterm.js | 🟡 |
| D-08 | Database: **PostgreSQL**, not SQLite | ✅ |
| D-09 | The Blackwall is an **instanced laser lattice**, not a noise plane | ✅ |
| D-10 | **CameraRig is the only camera writer in every mode** — den poses + damp, no `CameraControls` | ✅ |
| D-11 | Salary: **calendar windows in the user's timezone** + one `--force` re-take per window | ✅ |
| D-12 | Budget `Reached` is **celebration only** — no purchase mechanic, escrow reclaimed via cancel | ✅ |
| D-13 | **Config registry**: known keys, server-validated, `sudo`-gated terminal mutations | ✅ |
| D-14 | GitHub connect (Phase 5) via **OAuth device flow** from the terminal | ✅ |
| D-15 | **First GitHub login claims the dev seed**; tokens vaulted with Data Protection, key ring in Postgres; no auth backdoor — offline dev uses a fake GitHub | ✅ |

---

## D-01 — react-three-fiber ✅
Edi's call (2026-09-03): used to React; R3F's declarative scene graph + drei/postprocessing ecosystem beats hand-rolled three.js for a project this size. Custom GLSL still fully available via `shaderMaterial`.

## D-02 — GitHub OAuth App with `repo` scope ✅
OAuth App is far less setup than a GitHub App (no installation flow) and fine for a personal dashboard. Scope trade-off: `public_repo` can't see private repos; `repo` sees everything but is a coarse grant (technically includes write, though we only read). **Recommendation:** `read:user` + `repo` so *your* private projects show up — it's your own token on your own dashboard. Revisit (GitHub App, fine-grained read-only) only if this ever becomes multi-user.

*Confirmed by Phase 5 (2026-09-04).* Scopes `read:user repo`, requested through the device grant. The OAuth app needs **Enable Device Flow** ticked; the callback URL is unused and no client secret exists anywhere in the system.

## D-03 — Client-side command parsing 🟡
Terminal keeps a command registry (name, args schema, handler, help text) and maps commands onto clean REST calls. Server stays a normal API (testable, reusable, OpenAPI-documented) and still owns all invariants (overdraft, escrow, cooldowns). Alternative — a single `POST /terminal/exec` that parses server-side — feels cool but couples UX to API and makes autocomplete/help harder. **Recommendation:** client-side registry.

## D-04 — GSAP ScrollTrigger + Lenis ✅
We need: pinned full-screen canvas, 5 acts with eased per-act uniform timelines, scrub control, and a clean "unpin into interactive mode" at the end. ScrollTrigger timelines express that directly and GSAP is fully free now; drei `ScrollControls` is simpler but fights us on the final handoff and DOM/canvas mixing. **Recommendation:** ScrollTrigger drives a normalized `t` into zustand; R3F consumes it. (Research doc 01 has tutorials for both.)

*Confirmed by Phase 2 (2026-09-03).* Shipped as a single scrubbed trigger over a
`600svh` track writing `progress` into the store, with Lenis glued in via
`gsap.ticker`. Two things are worth knowing before touching this again:

1. The per-act timelines never materialized and were not needed. Acts turned
   out to be cleaner as **pure functions of `t`** (`rig/acts.ts`: `actAt`,
   `actWindow`, `ramp`) read inside `useFrame`, rather than as GSAP tweens on
   uniforms. Scrubbing backwards is then free, and nothing can desynchronize
   from the scroll position.
2. `useGSAP` **defers its cleanup to unmount whenever it is given a dependency
   array**. A dependency change re-runs the callback without calling the
   cleanup you returned, which silently leaves a second ScrollTrigger and a
   second Lenis running. Always pass the config form with
   `revertOnUpdate: true`.

## D-05 — Primitives-first room 🟡
Full control over style (emissive Arasaka red/black), zero license risk, tiny download, and monitors need to be *our* meshes anyway (screen quads we control for glow/zoom/Html). CC0/CC-BY props (chair, clutter, keyboard) can be dropped in later where primitives look too crude. **Recommendation:** hybrid, primitives-first; verified asset links live in research doc 02 if we want them.

## D-06 — GitHub is the login ✅
One identity: `login` in either terminal → GitHub OAuth → session cookie; first login seeds the wallet account. Avoids building username/password auth (which we'd never want to maintain) and REPO.NET needs GitHub anyway. Dev mode keeps a seeded local user so Phases 1–4 don't block on OAuth. **Recommendation:** accept; add an anonymous "demo mode" in Phase 6 for showing the app without logging in.

*Confirmed by Phase 5 (2026-09-04).* Every wallet/budget/config/repo route is behind the cookie; the seeded dev user is no longer reachable without logging in — the first GitHub identity claims it (D-15). The demo mode stays a Phase 6 item.

## D-07 — Custom terminal component 🟡
xterm.js is a full VT-emulator — overkill and hard to style as a diegetic CP2077 screen (it owns its DOM/canvas). A custom component (~300 lines) gives us themed tables, typewriter output, glitch text, autocomplete chips, and clickable output for free. **Recommendation:** custom; steal ideas from xterm only if we ever need real PTY behavior.

## D-09 — The Blackwall is an instanced laser lattice ✅
Edi's call (2026-09-03), with a reference image. The original Phase 2 wall was a single plane running domain-warped FBM — it read as *boiling smoke*, and a flat plane can only ever be approached, never entered. The wall is now a volume: ~5.2k instanced dashed beams (crossed quads, additive, per-instance seeds driving dash density, drift, brightness and colour) spread through z ∈ [-16, 30] and x ∈ ±46, with the camera path threading a jittered corridor kept clear of eye-height beams — so the dive genuinely passes *between* lasers. Behind them sits the horizon: an additive quad with a white-hot core, red glow, wide haze and per-column spikes, which act 2 both brightens and thickens until it owns the frame and the pierce flash finishes the whiteout.

Why it is the better call beyond matching the brief: it is *cheaper* (4.07 ms vs the plane's full-screen 11-simplex fragment cost), it gives the journey real parallax and depth cues the plane could not, and the quality ladder becomes a simple instance count (5200/2800/1300) instead of a shader recompile. Files: `scene/materials/laserFieldMaterial.ts`, `scene/materials/horizonMaterial.ts`, `scene/acts/Act1Blackwall.tsx`; `blackwallMaterial.ts` is deleted. The vendored simplex/FBM chunk stays — the act-4 room dissolve still uses it.

## D-10 — One camera writer, in every mode ✅
Decided in Phase 3 (2026-09-04), deviating from ARCHITECTURE §2.2's suggestion of drei `CameraControls` for the den. Three reasons: two writers fight — `CameraControls` and the rig would each damp the camera toward different targets every frame; nobody asked for orbit — the den wants exactly three poses (seat, two screen zooms) plus pointer parallax, which is a target offset, not a control scheme; and `MathUtils.damp` toward a derived pose already gives the ~0.8s dolly the design wants, arrival measured by distance rather than timed. The den is a pose machine inside the same `useFrame` that drives the journey curves.

## D-11 — Salary as calendar windows + one force ✅
Edi's call (2026-09-04). Not a rolling cooldown: the claim window is the user's *actual calendar month* (default) or ISO week, evaluated in the user's timezone — claim Sep 30, claim again Oct 1, both work. One normal claim per window; a second attempt is refused with a themed warning *and a hint* pointing at `salary --force`, which succeeds exactly once per window. Hard cap 2 claims/window. Cadence is a config key (`wallet.salary.cadence`), so the schema stores two UTC timestamps (`SalaryLastClaimedAt`, `SalaryLastForcedAt`) and buckets them at read time; the client sends `X-Timezone` (IANA) on every request.

## D-12 — Reached is celebration only ✅
Edi's call (2026-09-04), rejecting the "Reached consumes the escrow as a purchase" alternative: a purchase mechanic changes the app's purpose and drags complexity into everything around it (items, ownership, sinks). Instead the fund call that crosses the target auto-locks the budget to `Reached` and returns celebratory output — a *notification* to go buy the thing in real life. Escrow stays put, money stays conserved; `budget cancel` (legal on Active *and* Reached) reclaims it afterward. The manual `budget done` command is dropped — auto-lock on fund supersedes it.

## D-13 — Config registry with a sudo gate ✅
Edi's call (2026-09-04): the terminal gets a config family — settings are part of the fiction, not a settings page. Server side it's a *registry*, not a free-form KV store: only known, namespaced keys (`wallet.*`, later `repo.*`), each typed, validated, defaulted; some write through to real columns (alias, salary amount), others to a `USER_SETTING` row (cadence, pagesize). Terminal mutations require the `sudo` prefix — purely theatrical, but it splits reads from writes: `config set` alone returns `PERMISSION DENIED — you are not root. try: sudo config set …`. Phase 4 ships `wallet.salary.cadence`, `wallet.salary.amount`, `wallet.account.alias`, `wallet.history.pagesize`.

## D-14 — GitHub device flow ✅
Edi's call (2026-09-04), superseding the redirect/popup assumption in §8/D-02's flow description (the OAuth App + scopes decision stands). Connecting GitHub can never be a `config set` — OAuth never lets a credential touch our app — so the terminal initiates the *device flow*: print `ENTER CODE XXXX-XXXX AT github.com/login/device`, poll until approved, then `UPLINK ESTABLISHED`. The whole ceremony stays inside the CRT. PAT paste was vetoed (trains users to paste secrets). Repo *selection* (which repo the dashboard tracks) becomes plain `repo.*` config keys in Phase 5. Builds in Phase 5; recorded now so §8 gets reworked against it.

## D-15 — Seed claim, token vault, no backdoor ✅
Decided in Phase 5 (2026-09-04) while implementing D-06/D-14; three small calls that belong together.

1. **The first GitHub login claims the unlinked seed.** The dev database has one user with `GitHubId IS NULL` and a Phase 4 ledger worth keeping. Rather than a migration tool or a "merge accounts" command, the oldest unlinked user is simply linked to the first GitHub identity that logs in (handle := GitHub login). Every later identity gets a fresh account with a single €$ 2,077.00 `Income` row, so the conservation invariant holds from row one. In production there is no seed and the rule is inert.
2. **Tokens are vaulted, not cookied.** The GitHub access token is encrypted with ASP.NET Data Protection into `User.GitHubTokenCipher`; the cookie carries only the user id. The key ring is persisted in Postgres (`DataProtectionKeys`) so a container rebuild neither logs everyone out nor orphans the tokens — the alternative (keys in the container filesystem) would have made `docker compose up --build` a logout.
3. **No dev login backdoor.** The dev machine had no OAuth app when Phase 5 landed, which made a `login --dev` tempting. Rejected: a bypass path in the auth code is exactly the kind of thing that ships. Instead `tools/github-stub` fakes github.com *and* api.github.com (device flow with an approve page, ETags, Link paging, rate headers) behind `compose.github-stub.yml`, so the real code path runs offline. It doubled as Phase 5's verification harness.

## D-08 — PostgreSQL over SQLite ✅
Edi's call (2026-09-03). Rationale: we're in compose anyway (a DB container costs one YAML block); real `numeric(14,2)` for money vs SQLite's TEXT/REAL affinity; free `xmin` concurrency token; EF migrations are provider-specific so switching later would mean regenerating them; identical dev/prod story. Using `postgres:18-alpine` (volume mounts at `/var/lib/postgresql` — see research 04 §1).

---

*2026-09-03: Edi green-lit implementation. The remaining 🟡 items proceed on their stated recommendations — veto any of them before the phase that uses it lands (D-05: Phase 3, D-02/06: Phase 5, D-03/07: Phases 3–4). D-04 is now settled by Phase 2; D-02/D-06 by Phase 5.*

*Superseded/rejected ideas get moved to the bottom with a one-line why, so we don't re-litigate them.*
