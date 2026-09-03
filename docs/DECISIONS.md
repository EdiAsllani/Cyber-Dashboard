# Decision log (ADR-lite)

Statuses: ✅ decided · 🟡 proposed (awaiting Edi) · ⬜ later

| # | Decision | Status |
|---|----------|--------|
| D-01 | three.js via **react-three-fiber**, not vanilla three | ✅ |
| D-02 | GitHub access: OAuth App with `read:user` + `repo` scope | 🟡 |
| D-03 | Terminal commands parsed **client-side** → typed REST endpoints | 🟡 |
| D-04 | Scroll rig: **GSAP ScrollTrigger + Lenis**, not drei ScrollControls | 🟡 |
| D-05 | Room built from **primitives + emissive materials**, CC0 props optional | 🟡 |
| D-06 | **GitHub OAuth is the only login**; wallet data keyed to that identity | 🟡 |
| D-07 | Terminal UI: **custom React component**, not xterm.js | 🟡 |
| D-08 | Database: **PostgreSQL**, not SQLite | ✅ |

---

## D-01 — react-three-fiber ✅
Edi's call (2026-09-03): used to React; R3F's declarative scene graph + drei/postprocessing ecosystem beats hand-rolled three.js for a project this size. Custom GLSL still fully available via `shaderMaterial`.

## D-02 — GitHub OAuth App with `repo` scope 🟡
OAuth App is far less setup than a GitHub App (no installation flow) and fine for a personal dashboard. Scope trade-off: `public_repo` can't see private repos; `repo` sees everything but is a coarse grant (technically includes write, though we only read). **Recommendation:** `read:user` + `repo` so *your* private projects show up — it's your own token on your own dashboard. Revisit (GitHub App, fine-grained read-only) only if this ever becomes multi-user.

## D-03 — Client-side command parsing 🟡
Terminal keeps a command registry (name, args schema, handler, help text) and maps commands onto clean REST calls. Server stays a normal API (testable, reusable, OpenAPI-documented) and still owns all invariants (overdraft, escrow, cooldowns). Alternative — a single `POST /terminal/exec` that parses server-side — feels cool but couples UX to API and makes autocomplete/help harder. **Recommendation:** client-side registry.

## D-04 — GSAP ScrollTrigger + Lenis 🟡
We need: pinned full-screen canvas, 5 acts with eased per-act uniform timelines, scrub control, and a clean "unpin into interactive mode" at the end. ScrollTrigger timelines express that directly and GSAP is fully free now; drei `ScrollControls` is simpler but fights us on the final handoff and DOM/canvas mixing. **Recommendation:** ScrollTrigger drives a normalized `t` into zustand; R3F consumes it. (Research doc 01 has tutorials for both.)

## D-05 — Primitives-first room 🟡
Full control over style (emissive Arasaka red/black), zero license risk, tiny download, and monitors need to be *our* meshes anyway (screen quads we control for glow/zoom/Html). CC0/CC-BY props (chair, clutter, keyboard) can be dropped in later where primitives look too crude. **Recommendation:** hybrid, primitives-first; verified asset links live in research doc 02 if we want them.

## D-06 — GitHub is the login 🟡
One identity: `login` in either terminal → GitHub OAuth → session cookie; first login seeds the wallet account. Avoids building username/password auth (which we'd never want to maintain) and REPO.NET needs GitHub anyway. Dev mode keeps a seeded local user so Phases 1–4 don't block on OAuth. **Recommendation:** accept; add an anonymous "demo mode" in Phase 6 for showing the app without logging in.

## D-07 — Custom terminal component 🟡
xterm.js is a full VT-emulator — overkill and hard to style as a diegetic CP2077 screen (it owns its DOM/canvas). A custom component (~300 lines) gives us themed tables, typewriter output, glitch text, autocomplete chips, and clickable output for free. **Recommendation:** custom; steal ideas from xterm only if we ever need real PTY behavior.

## D-08 — PostgreSQL over SQLite ✅
Edi's call (2026-09-03). Rationale: we're in compose anyway (a DB container costs one YAML block); real `numeric(14,2)` for money vs SQLite's TEXT/REAL affinity; free `xmin` concurrency token; EF migrations are provider-specific so switching later would mean regenerating them; identical dev/prod story. Using `postgres:18-alpine` (volume mounts at `/var/lib/postgresql` — see research 04 §1).

---

*2026-09-03: Edi green-lit implementation. The remaining 🟡 items proceed on their stated recommendations — veto any of them before the phase that uses it lands (D-04/05: Phases 2–3, D-02/06: Phase 5, D-03/07: Phase 3–4).*

*Superseded/rejected ideas get moved to the bottom with a one-line why, so we don't re-litigate them.*
