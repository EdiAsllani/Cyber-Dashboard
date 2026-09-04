namespace Api.Repos;

/// <summary>
/// ARCHITECTURE §6 — REPO.NET. Session required. Every response carries
/// <c>X-Cache: HIT | REVALIDATED | MISS | BYPASS</c> (worst verdict across the
/// GitHub calls it needed) so the terminal can show the cache doing its job.
/// </summary>
public static class RepoEndpoints
{
    public static void MapRepos(this IEndpointRouteBuilder app)
    {
        var repos = app.MapGroup("/api/repos").RequireAuthorization();

        repos.MapGet("/", (RepoService r, CacheTrace t, HttpContext http, CancellationToken ct) =>
            Traced(http, t, r.ListAsync(ct)));

        repos.MapGet("/rate", (RepoService r, CacheTrace t, HttpContext http, CancellationToken ct) =>
            Traced(http, t, r.RateAsync(ct)));

        repos.MapGet("/{owner}/{name}/summary",
            (string owner, string name, RepoService r, CacheTrace t, HttpContext http, CancellationToken ct) =>
                Traced(http, t, r.SummaryAsync(owner, name, ct)));

        repos.MapGet("/{owner}/{name}/commits",
            (string owner, string name, int? take, RepoService r, CacheTrace t, HttpContext http, CancellationToken ct) =>
                Traced(http, t, r.CommitsAsync(owner, name, take ?? 5, ct)));

        repos.MapGet("/{owner}/{name}/pulls",
            (string owner, string name, int? take, RepoService r, CacheTrace t, HttpContext http, CancellationToken ct) =>
                Traced(http, t, r.PullsAsync(owner, name, take ?? 5, ct)));
    }

    private static async Task<IResult> Traced<T>(HttpContext http, CacheTrace trace, Task<T> work)
    {
        var dto = await work;
        http.Response.Headers["X-Cache"] = trace.Worst;
        return Results.Ok(dto);
    }
}
