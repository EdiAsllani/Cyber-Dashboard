using Api.Data;
using Api.Endpoints;
using Api.Wallet;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<WalletService>();

var app = builder.Build();

// Refused invariants surface as typed WalletError → 4xx { code, message, meta }
// (the terminal maps codes to themed output, D-03); racing xmin writers → 409.
app.Use(async (http, next) =>
{
    try
    {
        await next();
    }
    catch (WalletError e)
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

// Dev-only startup migration + seed; prod will use a one-shot migration bundle
// (docs/research/04-devops.md §4). EF tools abort before this line at design time.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DevSeeder.SeedAsync(db);
}

app.MapGet("/api/health", async (AppDbContext db, CancellationToken ct) =>
{
    var dbUp = await db.Database.CanConnectAsync(ct);
    return Results.Ok(new
    {
        status = dbUp ? "breached" : "blackwall-holding",
        db = dbUp,
        phase = 4,
        env = app.Environment.EnvironmentName,
    });
});

app.MapWallet();

app.Run();
