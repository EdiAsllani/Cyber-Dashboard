# Phase 4 Implementation Plan — WALLET.SYS

Brainstormed with Edi 2026-09-04 (decisions D-11…D-14). This plan turns the mock
wallet terminal into a real ledger backed by Postgres, plus the config command
family. REPO.NET stays mock until Phase 5.

## 0. Context — where the code stands

- Server is a walking skeleton: empty `AppDbContext`, one `/api/health` endpoint,
  dev-only startup migration. EF 10 + Npgsql 10, design-time connstring in
  `appsettings.Development.json` (host port 5432 is published, so `dotnet ef`
  works from the host).
- Client terminal is the Phase 3 mock: `terminal/types.ts` is the seam — a
  command is `{name, args, help, run(argv, ctx) → TerminalLine[]}`. Phase 4
  swaps command bodies for API calls; renderer/hook/registry stay untouched.
- `status` already hits `/api/health` and is the model for error handling
  (`NO CARRIER` on network failure).

## 1. Decisions this phase implements (see DECISIONS.md)

- **D-11 Salary windows**: cadence is a *calendar* window in the **user's
  timezone** (monthly default, weekly configurable) — claim on Sep 30, claim
  again Oct 1. One normal claim per window; a second attempt is refused with a
  hint pointing at `salary --force`, which succeeds **once** per window. Hard
  cap: 2 claims per window.
- **D-12 Reached = celebration only**: crossing the target auto-locks the
  budget to `Reached` (in the same fund call, celebratory output returned
  there); the escrow stays put and money is conserved. The user buys the item
  in real life, then `budget cancel` reclaims the escrow — cancel is legal on
  Active *and* Reached. `budget done` is dropped.
- **D-13 Config registry**: known keys only, typed + validated server-side,
  per-user storage. Mutations require the `sudo` prefix — without it, a themed
  `PERMISSION DENIED`. Phase 4 keys: `wallet.salary.cadence` (monthly|weekly),
  `wallet.salary.amount`, `wallet.account.alias`, `wallet.history.pagesize`.
- **D-14 GitHub device flow** (Phase 5, recorded now): connecting GitHub will
  be the OAuth *device flow* initiated from the terminal (`ENTER CODE XXXX-XXXX
  AT github.com/login/device`), not a redirect. Nothing to build this phase.
- Extras (Edi-approved): ASCII progress bars in `budget`, consistent `€$`
  formatting everywhere, a `stats` command, `history` filters.

## 2. Data model (server)

Entities per ARCHITECTURE §5, with these Phase-4 additions:

- `Account.SalaryLastForcedAt` (nullable) alongside `SalaryLastClaimedAt` —
  both UTC; window membership is computed by converting to the user's tz.
- `Budget.Seq` (int, unique per user, `max+1` on create) — the terminal-facing
  id. Nobody types GUIDs into a CRT.
- `UserSetting { UserId, Key, Value }` PK `(UserId, Key)` — storage for
  registry keys that don't map to an existing column (`cadence`, `pagesize`).
  `alias` and `salary.amount` write through to their `Account` columns.

Mapping rules: money is `numeric(14,2)` (`HasPrecision(14, 2)`); enums stored
as strings; `UseXminAsConcurrencyToken()` on `Account` and `Budget`.

**Money conservation invariant**: every movement writes a `Transaction`;
`Balance == Σ amounts` of non-escrow view (BudgetFund is negative, BudgetRefund
positive) and each budget's `FundedAmount == Σ` its funds − refunds. The seeder
must satisfy this by construction.

### Seed (dev user until Phase 5)

Idempotent (skip if any user exists): user `edi` / handle `netrunner-1`,
account `ARASAKA TRUST // NIGHT-CITY-SAVINGS`, salary `€$ 2,500`, ~10 flavored
transactions (gigs, ramen, ammo, netdeck parts) whose signed sum is the seeded
balance, plus two budgets — one partially funded through real `BudgetFund`
transactions so `history` and `budget` read alive on first open.

## 3. Salary mechanics

Window key in user tz: monthly → `yyyy-MM`; weekly → ISO-8601 year-week
(Monday start). The client sends `X-Timezone: <IANA name>` on every request
(from `Intl.DateTimeFormat().resolvedOptions().timeZone`); invalid/missing →
UTC. Claim algorithm, inside the one transactional service method:

1. `force == false`: if `windowKey(SalaryLastClaimedAt) == windowKey(now)` →
   refuse `SALARY_ALREADY_CLAIMED` (client renders the `--force` hint).
   Else credit + stamp `SalaryLastClaimedAt`.
2. `force == true`: if the normal slot is unused this window, it behaves as a
   normal claim (force is an override, not a separate paycheck). Else if
   `windowKey(SalaryLastForcedAt) == windowKey(now)` → refuse
   `SALARY_FORCE_EXHAUSTED`. Else credit + stamp `SalaryLastForcedAt`.

Cadence changes mid-window just change how the stored timestamps are bucketed —
no migration of past claims, documented behavior.

## 4. API surface (all keyed to the seeded user until Phase 5)

Per ARCHITECTURE §6 (updated this phase). Errors: 4xx JSON
`{ code, message, meta? }`; the client maps `code` → themed flavor (D-03: the
server owns invariants, the client owns drama). Codes: `INVALID_AMOUNT`,
`OVERDRAFT`, `SALARY_ALREADY_CLAIMED`, `SALARY_FORCE_EXHAUSTED`,
`BUDGET_NOT_FOUND`, `BUDGET_NOT_ACTIVE`, `BUDGET_HAS_HISTORY`,
`UNKNOWN_SETTING`, `INVALID_SETTING_VALUE`, `CONCURRENCY_CONFLICT`.

- `GET /api/me` — user + account summary (`whoami` upgrades to this).
- `GET /api/wallet` — balance, alias, provider + salary status block
  (amount, cadence, current-window claim/force availability).
- `POST /api/wallet/pay` / `income` — `{ amount, memo? }`; amount > 0,
  ≤ 2 decimals, cap 10,000,000; overdraft refused server-side.
- `POST /api/wallet/salary/claim` — `{ force?: bool }` per §3.
- `GET /api/wallet/transactions?take=&kind=&budget=` — newest first, filters
  optional; default `take` comes from `wallet.history.pagesize`.
- `GET /api/wallet/stats` — current window (user tz): income, spend, net,
  tx count, top expense; plus escrowed total and all-time income/spend.
- `GET /api/budgets`; `POST /api/budgets` `{ name, target }`;
  `POST /api/budgets/{seq}/fund` `{ amount }` (clamps to remaining, may flip
  to Reached, response carries `reached` + `clamped`);
  `POST /api/budgets/{seq}/cancel` (Active or Reached → refund escrow);
  `DELETE /api/budgets/{seq}` (only if it has no transactions).
- `GET /api/config`; `PUT /api/config/{key}` `{ value }`;
  `DELETE /api/config/{key}` (reset to default).

One transactional service (`WalletService`) owns every balance mutation;
`DbUpdateConcurrencyException` (xmin) maps to 409 `CONCURRENCY_CONFLICT`.

## 5. Terminal (client)

New files: `terminal/api.ts` (typed fetch client, `X-Timezone` header,
`ApiError{code,message,meta}`), `terminal/fmt.ts` (eddies `€$ 2,077.00`,
padded tables, `[████──────] 42%` bars, local timestamps).

`skins/wallet.ts` rewritten — final command set:

| Command | Notes |
|---|---|
| `balance` | balance, alias, provider, salary readiness line |
| `pay <amount> [memo…]` | overdraft → `TRANSACTION DECLINED — INSUFFICIENT EDDIES` |
| `income <amount> [memo…]` | freelance gig flavor |
| `salary [--force]` | refusal renders the force hint / exhausted flavor |
| `history [n] [--kind k] [--budget id]` | table; default n from config |
| `stats` | this window's income/spend/net + escrow + all-time |
| `budget` | table with seq ids, `€$`, progress bars, status |
| `budget add <name…> <target>` | last token is the target |
| `budget fund <id> <amount>` | clamp note; Reached → celebration block |
| `budget cancel <id>` | refunds escrow (works on Reached too) |
| `budget rm <id>` | delete, only if never used |
| `config list` / `config get <key>` | reads, no sudo |
| `sudo config set <key> <value>` / `sudo config reset <key>` | mutations |

`sudo` is its own command: `sudo config …` re-dispatches into the shared
config handler with `elevated=true`; bare `config set/reset` returns
`PERMISSION DENIED — you are not root. try: sudo config set …`. `whoami`
(BASE) upgrades to `/api/me` with the current static line as offline fallback.
Amount parsing accepts `1500`, `1,500`, `2077.50`.

## 6. Task order (each = one commit)

1. **Server domain**: entities, DbContext mapping, migration `WalletSys`,
   seeder. Verify: migration applies on compose boot, seed visible via psql.
2. **Server service + endpoints**: WalletService, settings registry, error
   middleware, all §4 endpoints. Verify: curl scripts cover the whole
   lifecycle incl. every refusal code.
3. **Client api + fmt**: typed client, formatting helpers.
4. **Client commands**: wallet skin rewrite, sudo/config, whoami upgrade.
   Verify in the browser through the real den terminal.
5. **Docs + acceptance sweep**: restart-persistence check
   (`docker compose restart`), typecheck, build, roadmap check-off.

## 7. Acceptance (ROADMAP Phase 4, expanded)

- pay/income/salary/history/stats/budget/config lifecycles all work end-to-end
  through the den terminal and survive `docker compose restart` (pgdata volume).
- Overdraft and double-salary-claim refused **server-side** (curl proves it,
  the terminal renders the themed error); `--force` works exactly once per
  window; window rolls over correctly across a month boundary in the user tz
  (unit-test the window-key function; weekly cadence flips behavior live via
  `sudo config set wallet.salary.cadence weekly`).
- Money conservation: after any command sequence, balance + Σ escrow equals
  Σ signed transactions (asserted in a seed-time check and spot-checked via
  psql).
- Budget auto-Reached on the crossing fund call with celebratory output;
  cancel refunds from Reached; overfund clamps; `budget rm` refuses once
  funded.
- Unknown config key / invalid value / missing sudo each themed distinctly.
- `€$` formatting + progress bars everywhere; typecheck + build green; works
  identically through `docker compose up --build --watch`.

## 8. Known traps

- **Npgsql + DateTime**: Postgres `timestamptz` requires `DateTimeKind.Utc` —
  always stamp `DateTime.UtcNow`, never `Now`, or Npgsql throws at write time.
- **decimal seeding drift**: build the seed balance by summing the seeded
  transactions, don't hand-write both.
- **TimeZoneInfo on Alpine**: the runtime image needs tzdata for IANA ids —
  the aspnet image ships ICU but Alpine variants may need `apk add tzdata`.
  Check the server Dockerfile base; if Alpine, add the package.
- **EF design-time**: `dotnet ef` runs from `server/src/Api` against the
  Development connstring; it does *not* need the DB up for `migrations add`.
- **compose watch rebuild**: `Api.csproj` changes trigger rebuild, `.cs` sync +
  `dotnet watch` hot restart (~5s). Migrations apply on boot in dev only.
- **Terminal line width**: the CRT viewport is narrow — keep tables ≤ ~70
  chars; truncate memos with `…` rather than wrapping.
