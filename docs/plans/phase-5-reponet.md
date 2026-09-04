# Phase 5 Implementation Plan — REPO.NET + auth

Implements D-02, D-06 and D-14 as recorded: GitHub is the only login, connected
through the OAuth **device flow** from inside the CRT, and REPO.NET reads real
repository data through a cached, ETag-aware GitHub client. Written 2026-09-04
at the start of the phase; the ROADMAP entry records what actually landed.

## 0. Context — where the code stands

- Server: wallet domain is live (Phase 4). `WalletService.CurrentAsync()`
  resolves "current user" as *the first user in the table* — the seam auth
  replaces. Every route is anonymous. `User.GitHubId/GitHubLogin/AvatarUrl`
  exist but are null for the seeded `edi` user.
- Client: `terminal/types.ts` is the seam. A command is `{name, args, help,
  run(argv, ctx)}`; `ctx` only has `clear()`. REPO.NET is the Phase 3 mock
  (one `repos` command that says ACCESS DENIED). `api.ts` throws `ApiError`
  with the server's code; skins map codes to themed lines.
- No `.env` exists on the dev machine — there is no GitHub OAuth app yet.

## 1. Decisions this phase implements

- **D-06 GitHub is the login.** Wallet, budgets, config and repo routes all
  require the session cookie from here on. Unauthenticated → `401 { code:
  "ACCESS_DENIED" }` → the terminal prints `ACCESS DENIED — run: login`.
  The dev seed user still exists (Development only), but it is no longer
  reachable without logging in: **the first GitHub login claims it** (§3).
  There is deliberately **no auth backdoor** in dev; the offline story is the
  fake GitHub in §7, and the anonymous demo mode stays a Phase 6 item.
- **D-14 device flow.** `login` → server asks GitHub for a device code →
  terminal prints `ENTER CODE XXXX-XXXX AT github.com/login/device` → the
  terminal polls our server, which polls GitHub → `UPLINK ESTABLISHED`. Only
  the *client id* is needed (device flow has no client secret and no callback
  URL); the OAuth app must have **"Enable Device Flow"** ticked.
- **D-02 scopes** `read:user repo`, unchanged.
- **Repo selection is config** (D-14's last line): `repo.default` joins the
  registry (`owner/name` or bare `name`); REPO.NET commands fall back to it
  when no repo argument is given.

## 2. Server — auth

```
src/Api/
├── ApiError.cs              # was Wallet/WalletError — one typed 4xx/5xx shape for every feature
├── Auth/
│   ├── CurrentUser.cs       # scoped: user id from the cookie principal; 401 SESSION_INVALID if the row is gone
│   ├── GitHubOAuthClient.cs # device/code + access_token against GitHub:OAuthBaseUrl
│   ├── DeviceFlowStore.cs   # IMemoryCache: opaque handle → { deviceCode, interval, expiresAt, lastPollAt }
│   ├── AuthService.cs       # start/poll ceremony, user upsert + seed claim, token vault, sign-in
│   └── AuthEndpoints.cs     # POST /api/auth/github/device/start|poll, POST /api/auth/logout
```

- **Cookie**: `blackwall.sid`, HttpOnly, SameSite=Lax, 30-day sliding. The
  redirect events are overridden to write `401/403` JSON, so the API never
  redirects. Antiforgery is not added: Lax + JSON bodies already keep
  cross-site form posts out, and there are no cross-origin callers.
- **Device flow store**: the browser never sees GitHub's `device_code`; it
  gets an opaque 32-byte handle. The server enforces GitHub's `interval`
  itself (polls arriving early return `pending` without touching GitHub) and
  honours `slow_down` by widening it.
- **Token vault**: the access token is encrypted with Data Protection
  (`IDataProtector` purpose `github-token`) into `User.GitHubTokenCipher`.
  Keys persist in Postgres (`PersistKeysToDbContext<AppDbContext>`) so a
  container rebuild neither logs everyone out nor orphans the tokens.
- **Migration `RepoNet`**: `User.GitHubTokenCipher`, `User.GitHubLinkedAt`,
  `User.LastLoginAt`, plus the `DataProtectionKeys` table.

## 3. User upsert + seed claim

On a completed device flow, with GitHub's `/user` in hand, in one transaction:

1. A user with this `GitHubId` exists → refresh login/avatar/token, sign in.
2. Else an **unlinked** user exists (`GitHubId IS NULL`, oldest first — the
   dev seed) → *claim* it: set GitHubId/login/avatar, handle := GitHub login.
   The Phase 4 ledger becomes this identity's wallet. Response says so.
3. Else create user + account (`ARASAKA TRUST // NIGHT-CITY-SAVINGS`, salary
   €$ 2,500) with a single `Income` row of **€$ 2,077.00** ("welcome bonus")
   so the conservation invariant holds from the first row.

`WalletService` loses its "first user" lookup and reads `CurrentUser`.

## 4. Server — REPO.NET

```
src/Api/Repos/
├── GitHubApiClient.cs   # thin typed HttpClient: REST with ETag cache, one GraphQL query, rate headers
├── RepoService.cs       # shapes DTOs; resolves the user's token; composes summary
├── Contracts.cs
└── RepoEndpoints.cs     # GET /api/repos, /api/repos/rate, /api/repos/{owner}/{name}[/summary|/commits|/pulls]
```

- **Cache**: per user + path, in `IMemoryCache`. Fresh for **60 s** (HIT, no
  network). Stale entries with an ETag revalidate with `If-None-Match`; a 304
  refreshes the clock and costs no rate budget (REVALIDATED). Otherwise MISS.
  Every GitHub round trip is logged at Information with the cache verdict and
  the `x-ratelimit-remaining` header, and each API response carries
  `X-Cache: HIT | REVALIDATED | MISS` (worst of its constituent calls) so the
  terminal can show it.
- **Requests**: `GET /user/repos?affiliation=owner&sort=pushed&per_page=100`,
  `GET /repos/{o}/{r}`, `GET /repos/{o}/{r}/commits?per_page=n` (+ `Link
  rel="last"`), `GET /repos/{o}/{r}/pulls?state=open&per_page=n`, one GraphQL
  query for totals (default-branch commit count, PR open/closed/merged
  counts), `GET /rate_limit` (free). Octokit is not used (research 03 §4).
- **Errors** → `ApiError`: GitHub 401 → **401 `UPLINK_REVOKED`** (remedy is
  `login`, so it shares the 401 path), 404 → `REPO_NOT_FOUND`, 403 with a
  zeroed remaining → 429 `RATE_LIMITED` (meta: reset), other 4xx → 502
  `UPLINK_REFUSED`, network/5xx → 502 `UPLINK_DOWN`.

## 5. Client

- `terminal/types.ts`: `CommandCtx` gains `print(lines)` (progressive output —
  the device ceremony prints the code, then waits) and `signal` (an
  `AbortSignal` that fires when the terminal unmounts, so ESC stops the
  poll loop). `TerminalSkin` gains optional `motd()` — printed after the
  banner; both skins use it to show the operator or the ACCESS DENIED hint.
- `state/session.ts`: tiny zustand store of `/api/me` (login = default repo
  owner), refreshed by `login`/`logout`/`motd`.
- `terminal/shared.ts`: line helpers, `run()` wrapper, base error theming
  (`ACCESS DENIED — run: login`, `NO CARRIER`, uplink codes), and the
  commands both skins share: `login`, `logout`, `config`, `sudo config`
  (moved out of `wallet.ts`).
- `skins/repo.ts` — final command set:

| Command | Notes |
|---|---|
| `login` | device ceremony; copies the code to the clipboard and opens the verification page (both best-effort) |
| `logout` | `UPLINK SEVERED` |
| `repos [n] [--all]` | table: name, ★, language, pushed; `--all` shows everything |
| `repo [name]` | summary card: branch, stars/forks/watchers, last push, latest commit, totals |
| `latest [name]` | latest commit: sha, author, message, when |
| `commits [name]` | total on default branch + last 5 |
| `prs [name] [--all]` | open PRs (default) or open/closed/merged totals |
| `rate` | core / search / graphql remaining, reset time |
| `config …`, `sudo config …` | same registry as WALLET.SYS, now incl. `repo.default` |

`[name]` accepts `owner/name` or `name` (owner = the session's GitHub login);
omitted → `repo.default`; neither → usage hint pointing at `sudo config set`.
Each repo command ends with a dim `cache :: HIT | REVALIDATED | MISS` line.

## 6. Compose / env

- `GitHub__ClientId` stays; `GitHub__ClientSecret` is dropped (device flow
  has none). `.env.example` documents the OAuth-app checklist.
- `GitHub:OAuthBaseUrl` / `GitHub:ApiBaseUrl` default to github.com /
  api.github.com in `appsettings.json` and are overridable — that is what §7
  uses.

## 7. Offline dev: the GitHub stub

`tools/github-stub/server.mjs` (Node, zero deps) + `compose.github-stub.yml`
(override file). It fakes exactly the endpoints in §2/§4 — device code,
token polling with a real "approve" page at `localhost:9797/login/device`,
`/user`, repos, commits with `Link` pagination, pulls, GraphQL totals,
`/rate_limit` — with ETags, 304s, and decrementing rate headers. It exists so
the whole ceremony can be exercised end-to-end in the CRT without a GitHub
account: `docker compose -f docker-compose.yml -f compose.github-stub.yml up
--build --watch`. It is also this phase's verification harness, because the
dev machine has no OAuth app.

## 8. Task order (each = one commit)

1. **Server auth**: ApiError rename, cookie auth, device flow, upsert/claim,
   token vault, `RepoNet` migration, wallet routes behind auth.
2. **Server REPO.NET**: GitHub client + cache, repo endpoints, `repo.default`.
3. **Client**: ctx/motd seams, session store, shared commands, REPO.NET skin,
   401 theming in both skins.
4. **GitHub stub + compose override**.
5. **Docs + acceptance sweep**.

## 9. Acceptance (ROADMAP Phase 5, expanded)

- Fresh browser → any wallet/repo command → `ACCESS DENIED — run: login`;
  `login` prints the code, approving completes the ceremony without leaving
  the CRT, `whoami`/`balance` work, the seed ledger was claimed (Phase 4 data
  intact under the GitHub identity).
- REPO.NET: `repos`, `repo`, `latest`, `commits`, `prs [--all]`, `rate` all
  render real data through the terminal; a repeat within 60 s is a HIT (no
  GitHub call, visible in `docker compose logs server`); after 60 s a 304
  revalidation shows as REVALIDATED; unknown repo → `REPO_NOT_FOUND` themed.
- `logout` kills the session: the next command is `ACCESS DENIED` again; the
  cookie is gone. Session and stored token survive `docker compose restart
  server` (keys in Postgres).
- A second GitHub identity gets a fresh account with the €$ 2,077.00 welcome
  row (conservation holds); the first identity's ledger is untouched.
- typecheck + build green; everything above verified through
  `docker compose up --build --watch` (+ the stub override).

## 10. Known traps

- **Device flow off by default**: a GitHub OAuth app refuses
  `/login/device/code` with `device_flow_disabled` until the checkbox is on.
- **GitHub returns 200 for pending polls** with `error: authorization_pending`
  in the body — branch on the body, not the status.
- **Data Protection + EF**: the key ring is created lazily on first protect;
  the `DataProtectionKeys` table must exist by then (dev migrates at boot).
- **Cookie through the Vite proxy**: no `Domain`, `Secure` = same-as-request;
  browsers accept it for `localhost` over http.
- **`User-Agent` is mandatory** on api.github.com — 403 without it.
- **Link header math**: `per_page=1` makes `rel="last"`'s page number the
  exact count, but only when the header is present (absent = one page).
