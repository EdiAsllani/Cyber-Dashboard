using Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Dev-only startup migration; prod will use a one-shot migration bundle
// (docs/research/04-devops.md §4). EF tools abort before this line at design time.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

app.MapGet("/api/health", async (AppDbContext db, CancellationToken ct) =>
{
    var dbUp = await db.Database.CanConnectAsync(ct);
    return Results.Ok(new
    {
        status = dbUp ? "breached" : "blackwall-holding",
        db = dbUp,
        phase = 1,
        env = app.Environment.EnvironmentName,
    });
});

app.Run();
