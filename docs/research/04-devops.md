# Research 04 — Docker dev environment & deployment

*Verified 2026-09-03 (links fetched that day unless marked [unverified]).*

## 1. Base images (verified tags)

| Component | Tag | Notes |
|---|---|---|
| .NET SDK (dev) | `mcr.microsoft.com/dotnet/sdk:10.0` | `-alpine` variants exist — [MCR tags](https://mcr.microsoft.com/v2/dotnet/sdk/tags/list) |
| ASP.NET runtime (prod) | `mcr.microsoft.com/dotnet/aspnet:10.0` | ships `DOTNET_VERSION=10.0.11`, `ASPNETCORE_HTTP_PORTS=8080`, `APP_UID=1654`; default user is **root** — opt into `USER app` in prod stage — [MCR tags](https://mcr.microsoft.com/v2/dotnet/aspnet/tags/list) |
| Node | `node:24-alpine` | Node **24 is Active LTS** (until 2026-10-20, maintenance to 2028); 22 = maintenance-only; 26 = Current, LTS late Oct 2026 — [endoflife.date/nodejs](https://endoflife.date/nodejs) |
| Postgres | `postgres:18-alpine` (pin `18.6` if strict) | **18 GA** since 2025-09-25, latest minor 18.6 — [endoflife.date/postgresql](https://endoflife.date/postgresql) |

⚠️ **Postgres 18 image volume change:** the image `VOLUME` moved from `/var/lib/postgresql/data` (≤17) to **`/var/lib/postgresql`** (PGDATA defaults to `/var/lib/postgresql/18/docker`). Mount the named volume at `/var/lib/postgresql` or data lands in an anonymous volume. (From the official image description, citing docker-library/postgres#1259.)

## 2. Hot reload: Compose Watch (current best practice)

- [Use Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) — `sync` (copy into container; hot-reload frameworks), `rebuild` (image rebuild), `sync+restart`. Run `docker compose up --watch`. Never sync `node_modules/`. Files land on the container FS → native inotify works, so **no polling hacks needed** (better than classic bind mounts).
- **dotnet:** SDK container runs `dotnet watch run --non-interactive`; env `DOTNET_USE_POLLING_FILE_WATCHER=true` (cheap safety net; required for bind mounts per [dotnet watch docs](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-watch)) + `DOTNET_WATCH_RESTART_ON_RUDE_EDIT=true`. Ignore `bin/`,`obj/` in sync; `rebuild` on `.csproj` change (package restore).
- **Vite:** `server.host: true`, `port: 5173`, `strictPort: true`, publish `5173:5173` (HMR then needs no extra config). `usePolling` NOT needed on native Linux + compose watch. Vite 8 note: `server.hmr` WS options deprecated in favor of `server.ws.clientPort` — [Vite server options](https://vite.dev/config/server-options.html) (Vite latest = **8.2.2**).
- Examples (fetched): [Docker .NET guide](https://docs.docker.com/guides/dotnet/develop/) · [Docker React guide](https://docs.docker.com/guides/reactjs/develop/) · [compose watch deep-dive (2026-01)](https://lours.me/posts/compose-tip-011-docker-compose-watch/) · [NetCoreTemplates/react-spa](https://github.com/NetCoreTemplates/react-spa) (.NET 10 + Vite React 19 template; wires the inverse proxy, prod serves wwwroot)

## 3. Dev routing

```ts
// vite.config.ts
server: {
  host: true, port: 5173, strictPort: true,
  proxy: { '/api': { target: 'http://server:8080', changeOrigin: true } },
}
```
`server` resolves via Compose service DNS → browser sees one origin (`localhost:5173`) → SameSite cookies work, zero CORS. ASP.NET listens on **8080** since .NET 8 (still true in 10; set `ASPNETCORE_HTTP_PORTS`) — [port breaking change](https://learn.microsoft.com/en-us/dotnet/core/compatibility/containers/8.0/aspnet-port).

**HTTPS in dev: skip.** TLS at Kestrel buys nothing behind the Vite proxy and costs cert-mounting ceremony ([docker-https doc](https://learn.microsoft.com/en-us/aspnet/core/security/docker-https)). Don't call `UseHttpsRedirection()` in Development. GitHub accepts `http://localhost:...` OAuth callbacks for dev apps.

## 4. Postgres + EF migrations

- Healthcheck `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` (`$$` escapes compose interpolation) + `depends_on: { db: { condition: service_healthy } }` — [startup order docs](https://docs.docker.com/compose/how-tos/startup-order/).
- **Dev:** `await db.Database.MigrateAsync()` on startup (Development-gated). EF Core 9+ takes a DB-wide migration lock, removing the old concurrent-startup risk — [Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying). Never `EnsureCreated` alongside migrations.
- **Prod:** migration **bundle** as a one-shot job after DB healthy (same doc), not per-replica startup migration.

## 5. Production sketch

**Single container:** multi-stage Dockerfile — `node:24-alpine` stage runs `vite build` → copy into ASP.NET publish `wwwroot` → final `aspnet:10.0` (+ `USER app`). In .NET 9/10 `app.MapStaticAssets()` gives pre-compression (gzip+brotli), fingerprinting, immutable caching — kills nginx's classic advantage ([static files docs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/static-files)); add `MapFallbackToFile("index.html")` for SPA deep links. Same shape as [NetCoreTemplates/react-spa](https://github.com/NetCoreTemplates/react-spa) and [this BFF write-up](https://theflatfield.net/posts/vite-aspnetcore-bff/). nginx only if we ever need edge/CDN behavior.

**Dev/prod split:** the [merge convention](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) — base `compose.yaml` + auto-loaded `compose.override.yaml` (dev watch/ports) + explicit `compose.prod.yaml`. Preferred over [profiles](https://docs.docker.com/compose/how-tos/profiles/) when the *same* services differ by configuration (our case).

## 6. Secrets in dev

- Untracked `.env` next to compose (auto-loaded for `${VAR}` interpolation); map to ASP.NET config via double underscore: `GitHub__ClientSecret=${GITHUB_CLIENT_SECRET}` — [compose env docs](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).
- `dotnet user-secrets` does **not** reach containers (host profile only — [user-secrets doc](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets)); keep for bare-metal runs only.
- Consider compose `secrets:` for the DB password if strict (env vars show in `docker inspect`). Never bake secrets into images; exclude `.env` and `.git` in `.dockerignore` too.
