using System.Globalization;

namespace Api.Wallet;

/// <summary>
/// D-11: salary claims are bucketed by *calendar* window in the user's
/// timezone — not a rolling cooldown. Two timestamps claimed in the same
/// window produce the same key; claim Sep 30, claim again Oct 1, both work.
/// </summary>
public static class SalaryWindow
{
    public const string Monthly = "monthly";
    public const string Weekly = "weekly";

    /// <summary>Window key, e.g. "2026-09" (monthly) or "2026-W36" (ISO weekly).</summary>
    public static string KeyFor(DateTime utc, string cadence, TimeZoneInfo tz)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz);
        return cadence == Weekly
            ? $"{ISOWeek.GetYear(local.Date):D4}-W{ISOWeek.GetWeekOfYear(local.Date):D2}"
            : $"{local.Year:D4}-{local.Month:D2}";
    }

    public static bool SameWindow(DateTime? claimedUtc, DateTime nowUtc, string cadence, TimeZoneInfo tz) =>
        claimedUtc is { } c && KeyFor(c, cadence, tz) == KeyFor(nowUtc, cadence, tz);
}
