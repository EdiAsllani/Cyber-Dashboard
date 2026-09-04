using Api.Wallet;

namespace Api.Endpoints;

/// <summary>
/// ARCHITECTURE §6 — wallet, budgets, config, me. Session auth arrives in
/// Phase 5; until then every route acts as the seeded dev user. The client
/// sends `X-Timezone` (IANA) for D-11 window math; invalid/missing → UTC.
/// </summary>
public static class WalletEndpoints
{
    public static void MapWallet(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/me", (WalletService w, CancellationToken ct) => w.MeAsync(ct));

        api.MapGet("/wallet", (WalletService w, HttpContext http, CancellationToken ct) =>
            w.WalletAsync(Tz(http), ct));

        api.MapPost("/wallet/pay", (PayRequest req, WalletService w, CancellationToken ct) =>
            w.PayAsync(req.Amount, req.Memo, ct));

        api.MapPost("/wallet/income", (PayRequest req, WalletService w, CancellationToken ct) =>
            w.IncomeAsync(req.Amount, req.Memo, ct));

        api.MapPost("/wallet/salary/claim",
            (SalaryRequest req, WalletService w, HttpContext http, CancellationToken ct) =>
                w.ClaimSalaryAsync(req.Force, Tz(http), ct));

        api.MapGet("/wallet/transactions",
            (int? take, string? kind, int? budget, WalletService w, CancellationToken ct) =>
                w.TransactionsAsync(take, kind, budget, ct));

        api.MapGet("/wallet/stats", (WalletService w, HttpContext http, CancellationToken ct) =>
            w.StatsAsync(Tz(http), ct));

        api.MapGet("/budgets", (WalletService w, CancellationToken ct) => w.BudgetsAsync(ct));

        api.MapPost("/budgets", (CreateBudgetRequest req, WalletService w, CancellationToken ct) =>
            w.CreateBudgetAsync(req.Name, req.Target, ct));

        api.MapPost("/budgets/{seq:int}/fund",
            (int seq, FundRequest req, WalletService w, CancellationToken ct) =>
                w.FundAsync(seq, req.Amount, ct));

        api.MapPost("/budgets/{seq:int}/cancel", (int seq, WalletService w, CancellationToken ct) =>
            w.CancelAsync(seq, ct));

        api.MapDelete("/budgets/{seq:int}", async (int seq, WalletService w, CancellationToken ct) =>
        {
            await w.DeleteBudgetAsync(seq, ct);
            return Results.NoContent();
        });

        api.MapGet("/config", (WalletService w, CancellationToken ct) => w.SettingsAsync(ct));

        api.MapPut("/config/{key}", (string key, SetSettingRequest req, WalletService w, CancellationToken ct) =>
            w.SetSettingAsync(key, req.Value, ct));

        api.MapDelete("/config/{key}", (string key, WalletService w, CancellationToken ct) =>
            w.ResetSettingAsync(key, ct));
    }

    private static TimeZoneInfo Tz(HttpContext http)
    {
        var id = http.Request.Headers["X-Timezone"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(id)) return TimeZoneInfo.Utc;
        try { return TimeZoneInfo.FindSystemTimeZoneById(id.Trim()); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
        catch (InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }
}
