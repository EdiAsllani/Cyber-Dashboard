using System.Globalization;
using System.Text.RegularExpressions;
using Api.Data;

namespace Api.Wallet;

/// <summary>
/// D-13: the config surface is a *registry*, not a free-form KV store — only
/// these keys exist, each typed, validated and defaulted. Column-backed keys
/// (alias, salary amount) read/write the Account row; the rest live in
/// UserSetting. WalletService is the only caller. Namespaces: `wallet.*`
/// (Phase 4), `repo.*` (Phase 5).
/// </summary>
public static partial class SettingsRegistry
{
    public sealed record Def(
        string Key,
        string Description,
        /// <summary>Human hint rendered by `config list`, e.g. "monthly | weekly".</summary>
        string Allowed,
        string Default,
        /// <summary>Canonicalize + validate; null means the value is refused.</summary>
        Func<string, string?> Normalize,
        /// <summary>Column-backed keys only; null for UserSetting-stored keys.</summary>
        Func<Account, string>? FromAccount = null,
        Action<Account, string>? ToAccount = null);

    public static readonly IReadOnlyList<Def> All =
    [
        new(
            "wallet.salary.cadence",
            "salary claim window (D-11)",
            "monthly | weekly",
            SalaryWindow.Monthly,
            v => v.Trim().ToLowerInvariant() switch
            {
                SalaryWindow.Monthly => SalaryWindow.Monthly,
                SalaryWindow.Weekly => SalaryWindow.Weekly,
                _ => null,
            }),
        new(
            "wallet.salary.amount",
            "eddies per salary claim",
            "0.01 .. 1000000, max 2 decimals",
            "2500.00",
            NormalizeMoney(max: 1_000_000m),
            FromAccount: a => a.SalaryAmount.ToString("F2", CultureInfo.InvariantCulture),
            ToAccount: (a, v) => a.SalaryAmount = decimal.Parse(v, CultureInfo.InvariantCulture)),
        new(
            "wallet.account.alias",
            "account display name",
            "1 .. 24 chars",
            "NIGHT-CITY-SAVINGS",
            v =>
            {
                var t = v.Trim();
                return t.Length is >= 1 and <= 24 ? t : null;
            },
            FromAccount: a => a.Alias,
            ToAccount: (a, v) => a.Alias = v),
        new(
            "wallet.history.pagesize",
            "default row count for `history`",
            "1 .. 50",
            "10",
            v => int.TryParse(v.Trim(), out var n) && n is >= 1 and <= 50
                ? n.ToString(CultureInfo.InvariantCulture)
                : null),
        // D-14: which repository the dashboard tracks is config, not auth.
        // Empty means unset — REPO.NET commands then insist on an argument.
        new(
            "repo.default",
            "repository REPO.NET commands fall back to",
            "owner/name or name (reset = unset)",
            "",
            v =>
            {
                var t = v.Trim();
                return RepoRef().IsMatch(t) ? t : null;
            }),
    ];

    [GeneratedRegex("^[A-Za-z0-9_.-]{1,100}(/[A-Za-z0-9_.-]{1,100})?$")]
    private static partial Regex RepoRef();

    public static Def? Find(string key) =>
        All.FirstOrDefault(d => d.Key.Equals(key.Trim(), StringComparison.OrdinalIgnoreCase));

    private static Func<string, string?> NormalizeMoney(decimal max) => v =>
        decimal.TryParse(v.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var d)
        && d > 0 && d <= max && decimal.Round(d, 2) == d
            ? d.ToString("F2", CultureInfo.InvariantCulture)
            : null;
}
