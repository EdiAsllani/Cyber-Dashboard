using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Repos;

public enum CacheVerdict { Hit, Revalidated, Miss, Bypass }

/// <summary>
/// Per-request tally of cache verdicts, so a composite endpoint (summary =
/// three GitHub calls) can report its worst case in one <c>X-Cache</c> header.
/// </summary>
public sealed class CacheTrace
{
    private readonly List<CacheVerdict> _verdicts = [];
    public void Record(CacheVerdict v) => _verdicts.Add(v);
    public string Worst => _verdicts.Count == 0 ? "NONE"
        : _verdicts.Contains(CacheVerdict.Miss) ? "MISS"
        : _verdicts.Contains(CacheVerdict.Bypass) ? "BYPASS"
        : _verdicts.Contains(CacheVerdict.Revalidated) ? "REVALIDATED"
        : "HIT";
}

/// <summary>
/// Thin typed HttpClient against <c>GitHub:ApiBaseUrl</c> (research 03 §4 —
/// Octokit hides Link headers and has no ETag support, and we need five
/// endpoints). Every REST GET goes through a per-user cache: fresh for 60 s
/// (HIT — no network), then revalidated with <c>If-None-Match</c> (a 304 is
/// REVALIDATED and costs no rate budget), otherwise fetched (MISS). Each
/// round trip is logged with the verdict and the remaining rate budget.
/// </summary>
public sealed partial class GitHubApiClient(
    HttpClient http, IMemoryCache cache, CacheTrace trace, ILogger<GitHubApiClient> log)
{
    public static readonly TimeSpan Fresh = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan Retain = TimeSpan.FromMinutes(30);

    private sealed class Entry
    {
        public required object Value { get; init; }
        public string? ETag { get; init; }
        public int? LastPage { get; init; }
        public DateTime FetchedAt { get; set; }
    }

    /// <summary>A GET result plus the page count GitHub's Link header implies (null = one page).</summary>
    public sealed record Paged<T>(T Value, int? LastPage);

    // ---- REST ----

    public async Task<Viewer> GetViewerAsync(string token, CancellationToken ct)
    {
        using var res = await SendAsync(Request(HttpMethod.Get, "/user", token), ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        LogRate("GET /user", res, CacheVerdict.Bypass);
        if (!res.IsSuccessStatusCode) throw MapError(res, body, "/user");
        return Deserialize<Viewer>(body);
    }

    public async Task<Paged<T>> GetAsync<T>(string token, Guid userId, string path, CancellationToken ct)
        where T : class
    {
        var key = $"gh:{userId}:{path}";
        var now = DateTime.UtcNow;
        var cached = cache.Get<Entry>(key);
        if (cached is not null && now - cached.FetchedAt < Fresh)
        {
            trace.Record(CacheVerdict.Hit);
            log.LogInformation("github GET {Path} :: HIT (age {Age:F0}s)", path, (now - cached.FetchedAt).TotalSeconds);
            return new Paged<T>((T)cached.Value, cached.LastPage);
        }

        var req = Request(HttpMethod.Get, path, token);
        if (cached?.ETag is { } etag) req.Headers.TryAddWithoutValidation("If-None-Match", etag);
        using var res = await SendAsync(req, ct);

        if (res.StatusCode == HttpStatusCode.NotModified && cached is not null)
        {
            cached.FetchedAt = now;
            cache.Set(key, cached, Retain);
            trace.Record(CacheVerdict.Revalidated);
            LogRate($"GET {path}", res, CacheVerdict.Revalidated);
            return new Paged<T>((T)cached.Value, cached.LastPage);
        }

        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            LogRate($"GET {path}", res, CacheVerdict.Miss);
            throw MapError(res, body, path);
        }
        var value = Deserialize<T>(body);
        var entry = new Entry
        {
            Value = value,
            ETag = res.Headers.ETag?.ToString(),
            LastPage = LastPageOf(res),
            FetchedAt = now,
        };
        cache.Set(key, entry, Retain);
        trace.Record(CacheVerdict.Miss);
        LogRate($"GET {path}", res, CacheVerdict.Miss);
        return new Paged<T>(value, entry.LastPage);
    }

    /// <summary>`/rate_limit` is free and never cached — it *is* the freshness probe.</summary>
    public async Task<RateLimit> GetRateLimitAsync(string token, CancellationToken ct)
    {
        using var res = await SendAsync(Request(HttpMethod.Get, "/rate_limit", token), ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        trace.Record(CacheVerdict.Bypass);
        if (!res.IsSuccessStatusCode) throw MapError(res, body, "/rate_limit");
        return Deserialize<RateLimit>(body);
    }

    // ---- GraphQL (totals in one point; no ETags, so 60 s cache only) ----

    public async Task<T> GraphQlAsync<T>(string token, Guid userId, string query, object variables, CancellationToken ct)
        where T : class
    {
        var payload = JsonSerializer.Serialize(new { query, variables });
        var key = $"gql:{userId}:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)))[..16]}";
        var now = DateTime.UtcNow;
        var cached = cache.Get<Entry>(key);
        if (cached is not null && now - cached.FetchedAt < Fresh)
        {
            trace.Record(CacheVerdict.Hit);
            log.LogInformation("github POST /graphql :: HIT (age {Age:F0}s)", (now - cached.FetchedAt).TotalSeconds);
            return (T)cached.Value;
        }

        var req = Request(HttpMethod.Post, "/graphql", token);
        req.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var res = await SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        LogRate("POST /graphql", res, CacheVerdict.Miss);
        if (!res.IsSuccessStatusCode) throw MapError(res, body, "/graphql");

        var envelope = Deserialize<GraphQlEnvelope<T>>(body);
        if (envelope.Data is null)
        {
            var first = envelope.Errors?.FirstOrDefault();
            if (first?.Type == "NOT_FOUND")
                throw ApiError.NotFound("REPO_NOT_FOUND", first.Message ?? "repository not found");
            throw new ApiError(502, "UPLINK_REFUSED", first?.Message ?? "graphql query failed",
                new { errors = envelope.Errors?.Select(e => e.Message) });
        }
        cache.Set(key, new Entry { Value = envelope.Data, FetchedAt = now }, Retain);
        trace.Record(CacheVerdict.Miss);
        return envelope.Data;
    }

    // ---- plumbing ----

    private static HttpRequestMessage Request(HttpMethod method, string path, string token)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        try
        {
            return await http.SendAsync(req, ct);
        }
        catch (HttpRequestException e)
        {
            log.LogWarning(e, "github api unreachable at {Base}", http.BaseAddress);
            throw new ApiError(502, "UPLINK_DOWN", "github unreachable");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiError(502, "UPLINK_DOWN", "github timed out");
        }
        finally
        {
            req.Dispose();
        }
    }

    private static ApiError MapError(HttpResponseMessage res, string body, string path)
    {
        string? message = null;
        try { message = JsonSerializer.Deserialize<GitHubMessage>(body)?.Message; } catch (JsonException) { }
        var remaining = Header(res, "x-ratelimit-remaining");
        return res.StatusCode switch
        {
            HttpStatusCode.Unauthorized => ApiError.Unauthorized("UPLINK_REVOKED",
                "github rejected the stored token — run: login"),
            HttpStatusCode.NotFound => ApiError.NotFound("REPO_NOT_FOUND", message ?? $"github has nothing at {path}"),
            HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests when remaining == "0" =>
                new ApiError(429, "RATE_LIMITED", "github rate budget exhausted",
                    new { reset = ResetOf(res) }),
            HttpStatusCode.Forbidden => new ApiError(502, "UPLINK_REFUSED", message ?? "github refused the request",
                new { status = 403 }),
            var s when (int)s >= 500 => new ApiError(502, "UPLINK_DOWN", $"github answered {(int)s}"),
            var s => new ApiError(502, "UPLINK_REFUSED", message ?? $"github answered {(int)s}",
                new { status = (int)s }),
        };
    }

    private void LogRate(string call, HttpResponseMessage res, CacheVerdict verdict)
    {
        log.LogInformation("github {Call} :: {Verdict} {Status} // rate {Remaining}/{Limit}",
            call, verdict.ToString().ToUpperInvariant(), (int)res.StatusCode,
            Header(res, "x-ratelimit-remaining") ?? "?", Header(res, "x-ratelimit-limit") ?? "?");
    }

    private static string? Header(HttpResponseMessage res, string name) =>
        res.Headers.TryGetValues(name, out var v) ? v.FirstOrDefault() : null;

    private static DateTime? ResetOf(HttpResponseMessage res) =>
        long.TryParse(Header(res, "x-ratelimit-reset"), out var epoch)
            ? DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime
            : null;

    [GeneratedRegex(@"[?&]page=(\d+)[^>]*>;\s*rel=""last""")]
    private static partial Regex LastPageRegex();

    private static int? LastPageOf(HttpResponseMessage res)
    {
        var link = Header(res, "Link");
        if (link is null) return null;
        var m = LastPageRegex().Match(link);
        return m.Success ? int.Parse(m.Groups[1].Value) : null;
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static T Deserialize<T>(string body)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(body, Json)
                ?? throw new ApiError(502, "UPLINK_REFUSED", "empty github response");
        }
        catch (JsonException e)
        {
            throw new ApiError(502, "UPLINK_REFUSED", "unreadable github response", new { detail = e.Message });
        }
    }

    // ---- GitHub JSON shapes (only the fields we read) ----

    public sealed record Viewer(long Id, string Login, [property: JsonPropertyName("avatar_url")] string? AvatarUrl, string? Name);

    public sealed record Owner(string Login);

    public sealed record Repo(
        string Name,
        [property: JsonPropertyName("full_name")] string FullName,
        Owner Owner,
        bool Private,
        string? Description,
        [property: JsonPropertyName("html_url")] string HtmlUrl,
        [property: JsonPropertyName("default_branch")] string DefaultBranch,
        [property: JsonPropertyName("stargazers_count")] int Stars,
        [property: JsonPropertyName("forks_count")] int Forks,
        [property: JsonPropertyName("subscribers_count")] int? Watchers,
        [property: JsonPropertyName("open_issues_count")] int OpenIssues,
        string? Language,
        [property: JsonPropertyName("pushed_at")] DateTime? PushedAt,
        [property: JsonPropertyName("created_at")] DateTime? CreatedAt);

    public sealed record CommitAuthor(string? Name, DateTime? Date);
    public sealed record CommitDetail(string Message, CommitAuthor? Author);
    public sealed record CommitItem(
        string Sha,
        [property: JsonPropertyName("html_url")] string HtmlUrl,
        [property: JsonPropertyName("commit")] CommitDetail Detail,
        Owner? Author);

    public sealed record PullHead(string Ref);
    public sealed record Pull(
        int Number,
        string Title,
        [property: JsonPropertyName("html_url")] string HtmlUrl,
        bool Draft,
        Owner? User,
        PullHead? Head,
        [property: JsonPropertyName("created_at")] DateTime CreatedAt,
        [property: JsonPropertyName("updated_at")] DateTime UpdatedAt);

    public sealed record RateBucket(int Limit, int Remaining, long Reset, int Used);
    public sealed record RateResources(RateBucket Core, RateBucket? Search, RateBucket? Graphql);
    public sealed record RateLimit(RateResources Resources);

    private sealed record GitHubMessage(string? Message);

    private sealed record GraphQlError(string? Type, string? Message);
    private sealed record GraphQlEnvelope<T>(T? Data, List<GraphQlError>? Errors);

    public sealed record Count(int TotalCount);
    public sealed record HistoryTarget(Count? History);
    public sealed record BranchRef(HistoryTarget? Target);
    public sealed record TotalsRepo(BranchRef? DefaultBranchRef, Count Open, Count Closed, Count Merged);
    public sealed record TotalsData(TotalsRepo? Repository);
}
