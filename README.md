# CYBER-DASHBOARD // codename: BLACKWALL

> A scroll-driven 3D dashboard styled after Cyberpunk 2077 — the Blackwall, Arasaka red/black, and in-world terminals. You scroll *through* the Blackwall, land in a netrunner's den, and run your life from the monitors on the desk.

**Status: `PHASE 0 — RESEARCH & ARCHITECTURE`** — no app code yet. Start at [docs/ROADMAP.md](docs/ROADMAP.md).

---

## The experience

One continuous scroll journey, then an interactive room:

| Act | Scene | What happens |
|-----|-------|--------------|
| 1 | **The Approach** | A void. The Blackwall looms — a giant undulating plane of red/black shader energy. HUD text glitches in. |
| 2 | **Contact** | Camera accelerates into the wall. Glitch/chromatic-aberration postFX spike. The screen "tears". |
| 3 | **The Breach** | Inside: a data-stream tunnel — instanced glyphs and light-lines streaming past. |
| 4 | **Decompression** | Noise decays. Wireframe geometry resolves and "materializes" into a room. |
| 5 | **The Den** | A small cyberpunk office: desk, monitors, neon. Scroll ends, pointer takes over. Monitors are clickable. |

Clicking a monitor dollies the camera into the screen and boots a terminal:

- **`WALLET.SYS`** — fictional bank terminal. Balance, account, provider; commands like `pay 200`, `salary`, `history`; budget goals you fund from your balance and track to completion (reached / cancelled).
- **`REPO.NET`** — GitHub terminal. Sign in with GitHub (OAuth), then query your repos: latest commit, total commits, open PRs, total PRs, and more.

## Stack

| Layer | Choice |
|-------|--------|
| 3D / Frontend | React + TypeScript + Vite, three.js via **react-three-fiber** (+ drei, postprocessing), GSAP ScrollTrigger for the scroll rig, zustand for state |
| Backend | **ASP.NET Core 10** minimal APIs, EF Core 10 |
| Database | PostgreSQL |
| Auth | GitHub OAuth → cookie session (BFF style) |
| Infra | Docker Compose (dev hot-reload via compose watch), single origin via Vite proxy |

## Repo layout

```
├── client/                 # Vite + React + R3F SPA        (Phase 1)
├── server/                 # ASP.NET Core 10 API           (Phase 1)
├── docs/
│   ├── ARCHITECTURE.md     # system design, data model, command spec
│   ├── ROADMAP.md          # build phases + acceptance criteria
│   ├── DECISIONS.md        # decision log (ADR-lite)
│   └── research/           # Phase 0 deep-research notes + resources
├── docker-compose.yml      # dev environment (blueprint until Phase 1)
└── .env.example            # copy to .env, fill in secrets
```

## Running

> Not functional until Phase 1 scaffolding lands.

```bash
cp .env.example .env   # then fill in GitHub OAuth credentials
docker compose up --build --watch
```

- Client: http://localhost:5173 (Vite dev server, proxies `/api` → server)
- API: http://localhost:5210
- Postgres: localhost:5432

## Docs index

- [Architecture](docs/ARCHITECTURE.md) — the full design: scene rig, services, data model, terminal commands
- [Roadmap](docs/ROADMAP.md) — phases
- [Decisions](docs/DECISIONS.md) — what's locked, what's open
- Research: [3D frontend](docs/research/01-frontend-3d.md) · [Visuals & assets](docs/research/02-visual-design.md) · [Backend](docs/research/03-backend.md) · [DevOps](docs/research/04-devops.md)

---

*This is an unofficial fan work and is not approved/endorsed by CD PROJEKT RED. Personal, non-commercial project inspired by Cyberpunk 2077; uses no game assets, no official logos — per CDPR's [Fan Content Guidelines](https://www.cdprojektred.com/en/fan-content) (notes in [docs/research/02-visual-design.md](docs/research/02-visual-design.md)).*
