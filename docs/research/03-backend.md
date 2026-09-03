# Research 03 — ASP.NET Core 10 backend, GitHub integration, auth

*Verified 2026-09-03 (links fetched that day unless marked [unverified]).*

## 1. .NET 10 status

- GA **2025-11-11**, **LTS** until **2028-11-14**; current patch **10.0.11** (2026-08-11) — [support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core), [what's new in .NET 10](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-10/overview)
- ASP.NET Core 10 highlights for us — [what's new](https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0):
  - **Minimal API validation**: `AddValidation()` validates DataAnnotations on request records → automatic 400 ProblemDetails
  - **Built-in OpenAPI 3.1** (`AddOpenApi`/`MapOpenApi`), XML doc comments included
  - **Cookie auth returns 401/403 (not login redirects) for API endpoints** automatically (`IApiEndpointMetadata`) — exactly what our terminal `ACCESS DENIED` flow wants, zero config
- EF Core 10 (LTS, needs net10): named query filters, `LeftJoin` operator, complex types w/ JSON columns — [what's new](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/whatsnew)
- Postgres provider: **`Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3** (needs EF ≥ 10.0.4) — [NuGet](https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL)

## 2. GitHub sign-in

- **`AspNet.Security.OAuth.GitHub` 10.0.0** (2025-11-11, targets net10.0 only) — [NuGet](https://www.nuget.org/packages/AspNet.Security.OAuth.GitHub), [repo + setup sample](https://github.com/aspnet-contrib/AspNet.Security.OAuth.Providers)
- Pattern: cookie = session, GitHub = challenge scheme:

```csharp
builder.Services
    .AddAuthentication(o => {
        o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        o.DefaultChallengeScheme = "GitHub";
    })
    .AddCookie(o => o.Cookie.SameSite = SameSiteMode.Lax)
    .AddGitHub(o => {
        o.ClientId = cfg["GitHub:ClientId"]!;
        o.ClientSecret = cfg["GitHub:ClientSecret"]!;
        o.Scope.Add("read:user");        // + "repo" if private repo stats wanted
        o.SaveTokens = true;             // or stash server-side in OnCreatingTicket
    });
```

- **Token storage:** `SaveTokens=true` puts the access token in the auth-cookie properties (`GetTokenAsync("access_token")`) — fine for a personal app since GitHub OAuth-app tokens don't expire (no refresh dance). If cookie size bothers us, capture `context.AccessToken` in `OnCreatingTicket` and store server-side (DB, encrypted via Data Protection). — [persist external tokens doc](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/social/additional-claims)
- **OAuth App > GitHub App** for this project: GitHub Apps have fine-grained perms but 8-hour expiring tokens + refresh flow; OAuth App tokens are non-expiring and the aspnet-contrib provider works out of the box — [differences doc](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- **Scopes** — [official list](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps): no scope = public read; `read:user` = profile; `public_repo` = public repos (incl. write!); `repo` = public+private (no read-only private option exists in classic scopes).

## 3. SPA + API auth: cookies win (Microsoft's own recommendation)

- MS Identity-for-SPA doc: *"We recommend using cookies for browser-based applications"* — [secure a Web API backend for SPAs](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity-api-authorization); same in [choose an identity solution](https://learn.microsoft.com/en-us/aspnet/core/security/how-to-choose-identity-solution) ("Cookies are preferred over tokens for both security and simplicity"). JWT only earns its keep with third-party/cross-domain consumers — we have none.
- Our single-origin setup (Vite proxy in dev, API-served SPA in prod) makes the cookie first-party, `SameSite=Lax`, `HttpOnly`, `Secure` in prod. ASP.NET Core 10's 401-for-APIs change removes the old redirect hack.
- **Antiforgery (belt & braces):** `AddAntiforgery(o => o.HeaderName = "X-XSRF-TOKEN")` + a token endpoint dropping a readable `XSRF-TOKEN` cookie the SPA echoes back — [CSRF doc](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)

## 4. GitHub data retrieval

| Need | How |
|---|---|
| Repo list | `GET /user/repos?affiliation=owner&sort=pushed` — [repos API](https://docs.github.com/en/rest/repos/repos) |
| Latest commit | `GET /repos/{o}/{r}/commits?per_page=1` (defaults to default branch, newest first) — [commits API](https://docs.github.com/en/rest/commits/commits) |
| Total commits | same call + parse page number from `Link: rel="last"` — [pagination doc](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) (handle missing Link = 1 page); or GraphQL `defaultBranchRef.target.history.totalCount` |
| Open PRs | `GET /repos/{o}/{r}/pulls?state=open&per_page=1` + Link trick — [pulls API](https://docs.github.com/en/rest/pulls/pulls) (no total_count field) |
| Total PRs | `GET /search/issues?q=repo:{o}/{r}+type:pr` → real `total_count` — [search API](https://docs.github.com/en/rest/search/search) (separate limit: 30 req/min); or GraphQL `pullRequests { totalCount }` |

- **Client library verdict:** Octokit 14.0.0 ([NuGet](https://www.nuget.org/packages/Octokit)) works on net10 but hides Link headers and has **no ETag/conditional-request support** (open issue since forever). Octokit.GraphQL is dormant (0.4.0-beta, 2024). **Recommendation: thin typed `HttpClient`** — we need ~5 endpoints, and raw HttpClient keeps ETags + Link headers, optionally one GraphQL POST to `https://api.github.com/graphql` that fetches commit total + PR totals in a single query.
- **Rate limits:** REST 5,000 req/hr per user; search 30 req/min; GraphQL 5,000 points/hr (our queries ≈ 1 point) — [REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api)
- **Caching etiquette:** store `ETag`, send `If-None-Match`; authorized 304s are **free** (don't count against the limit) — [best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api). Plan: per-user 60s in-memory cache + ETag revalidation.

## 5. Money modeling

- `decimal` → Postgres `numeric`; pin with `.HasPrecision(14, 2)` — [precision docs](https://learn.microsoft.com/en-us/ef/core/modeling/entity-properties)
- Optimistic concurrency: map Postgres's hidden `xmin` as row version — `[Timestamp] public uint Version { get; set; }` (the old `UseXminAsConcurrencyToken()` API is gone; use `IsRowVersion`) — [Npgsql concurrency docs](https://www.npgsql.org/efcore/modeling/concurrency.html). Races throw `DbUpdateConcurrencyException` → retry.
- Escrow flow (one `SaveChangesAsync` per command = atomic): fund = `Balance -= amt; goal.Funded += amt; add Tx(BudgetFund)`; cancel = refund + `Tx(BudgetRefund)`; every movement is an immutable transaction row.

## 6. Integration testing

- `Microsoft.AspNetCore.Mvc.Testing` 10.0.x (`WebApplicationFactory<Program>`) — [integration tests doc](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0)
- **`Testcontainers.PostgreSql` 4.14.0** — [module docs](https://dotnet.testcontainers.org/modules/postgres/), [NuGet](https://www.nuget.org/packages/Testcontainers.PostgreSql). xUnit `IAsyncLifetime` fixture starts a real Postgres; swap the DbContext registration in `ConfigureWebHost` — real `numeric` + `xmin` behavior, which in-memory providers can't exercise.
