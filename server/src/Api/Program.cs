using Api;
using Api.Auth;
using Api.Data;
using Api.Endpoints;
using Api.Repos;
using Api.Wallet;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(cfg.GetConnectionString("Default")));
builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();

// Key ring in Postgres: cookies and vaulted GitHub tokens survive a container
// rebuild (plan §2). The table arrives with the RepoNet migration.
builder.Services.AddDataProtection()
    .SetApplicationName("blackwall")
    .PersistKeysToDbContext<AppDbContext>();

// Cookie = the session (D-06). This is an API, so the handler never redirects:
// no session answers 401 JSON the terminal renders as ACCESS DENIED.
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "blackwall.sid";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromDays(30);
        o.SlidingExpiration = true;
        o.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = 401;
            return ctx.Response.WriteAsJsonAsync(new
            {
                code = "ACCESS_DENIED", message = "no session — run: login", meta = (object?)null,
            });
        };
        o.Events.OnRedirectToAccessDenied = ctx =>
        {
            ctx.Response.StatusCode = 403;
            return ctx.Response.WriteAsJsonAsync(new
            {
                code = "FORBIDDEN", message = "not yours", meta = (object?)null,
            });
        };
    });
builder.Services.AddAuthorization();

// GitHub: two hosts, two typed clients (D-14 device flow on github.com, data
// on api.github.com). Both base URLs are overridable so the offline stub
// (compose.github-stub.yml) can stand in for GitHub.
builder.Services.AddHttpClient<GitHubOAuthClient>(c =>
{
    c.BaseAddress = new Uri(cfg["GitHub:OAuthBaseUrl"] ?? "https://github.com");
    c.Timeout = TimeSpan.FromSeconds(15);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("cyber-dashboard-blackwall/0.5");
});
builder.Services.AddHttpClient<GitHubApiClient>(c =>
{
    c.BaseAddress = new Uri(cfg["GitHub:ApiBaseUrl"] ?? "https://api.github.com");
    c.Timeout = TimeSpan.FromSeconds(15);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("cyber-dashboard-blackwall/0.5");
    c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    c.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
});

builder.Services.AddSingleton<DeviceFlowStore>();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<CacheTrace>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<WalletService>();
builder.Services.AddScoped<RepoService>();

var app = builder.Build();

// Refused requests surface as typed ApiError → 4xx/5xx { code, message, meta }
// (the terminal maps codes to themed output, D-03); racing xmin writers → 409.
app.Use(async (http, next) =>
{
    try
    {
        await next();
    }
    catch (ApiError e)
    {
        http.Response.StatusCode = e.Status;
        await http.Response.WriteAsJsonAsync(new { code = e.Code, message = e.Message, meta = e.Meta });
    }
    catch (DbUpdateConcurrencyException)
    {
        http.Response.StatusCode = 409;
        await http.Response.WriteAsJsonAsync(new
        {
            code = "CONCURRENCY_CONFLICT",
            message = "another operation touched the ledger first — retry",
            meta = (object?)null,
        });
    }
});

app.UseAuthentication();
app.UseAuthorization();

// Dev-only startup migration + seed; prod will use a one-shot migration bundle
// (docs/research/04-devops.md §4). EF tools abort before this line at design time.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DevSeeder.SeedAsync(db);
}

app.MapGet("/api/health", async (AppDbContext db, GitHubOAuthClient gh, CancellationToken ct) =>
{
    var dbUp = await db.Database.CanConnectAsync(ct);
    return Results.Ok(new
    {
        status = dbUp ? "breached" : "blackwall-holding",
        db = dbUp,
        github = gh.Configured,
        phase = 5,
        env = app.Environment.EnvironmentName,
    });
});

app.MapAuth();
app.MapWallet();
app.MapRepos();

app.Run();
