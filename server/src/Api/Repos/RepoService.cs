using System.Text.RegularExpressions;
using Api.Auth;

namespace Api.Repos;

/// <summary>
/// Shapes GitHub's answers into REPO.NET DTOs for the session user. The
/// token comes out of the vault per request; a user without one (or whose
/// token GitHub rejects) is sent back to <c>login</c> via 401.
/// </summary>
public sealed partial class RepoService(CurrentUser current, AuthService auth, GitHubApiClient github)
{
    private const string TotalsQuery = """
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            defaultBranchRef { target { ... on Commit { history { totalCount } } } }
            open: pullRequests(states: OPEN) { totalCount }
            closed: pullRequests(states: CLOSED) { totalCount }
            merged: pullRequests(states: MERGED) { totalCount }
          }
        }
        """;

    private async Task<(Guid UserId, string Token)> SessionAsync(CancellationToken ct)
    {
        var (user, _) = await current.LoadAsync(ct);
        var token = auth.TokenFor(user)
            ?? throw ApiError.Unauthorized("UPLINK_REVOKED", "no github token on file — run: login");
        return (user.Id, token);
    }

    public async Task<List<RepoListItemDto>> ListAsync(CancellationToken ct)
    {
        var (uid, token) = await SessionAsync(ct);
        var page = await github.GetAsync<List<GitHubApiClient.Repo>>(token, uid,
            "/user/repos?affiliation=owner&sort=pushed&per_page=100", ct);
        return page.Value.Select(r => new RepoListItemDto(
            r.Owner.Login, r.Name, r.FullName, r.Private, r.Stars, r.Forks,
            r.Language, r.Description, r.PushedAt, r.DefaultBranch)).ToList();
    }

    public async Task<RepoSummaryDto> SummaryAsync(string owner, string name, CancellationToken ct)
    {
        Validate(owner, name);
        var (uid, token) = await SessionAsync(ct);
        var repo = (await github.GetAsync<GitHubApiClient.Repo>(token, uid, $"/repos/{owner}/{name}", ct)).Value;
        var latest = (await github.GetAsync<List<GitHubApiClient.CommitItem>>(token, uid,
            $"/repos/{owner}/{name}/commits?per_page=1", ct)).Value.FirstOrDefault();
        var totals = await TotalsAsync(token, uid, owner, name, ct);
        return new RepoSummaryDto(
            repo.Owner.Login, repo.Name, repo.FullName, repo.Private, repo.Description,
            repo.DefaultBranch, repo.Stars, repo.Forks, repo.Watchers ?? 0, repo.OpenIssues, repo.Language,
            repo.CreatedAt, repo.PushedAt, repo.HtmlUrl,
            latest is null ? null : ToDto(latest), totals);
    }

    public async Task<CommitsDto> CommitsAsync(string owner, string name, int take, CancellationToken ct)
    {
        Validate(owner, name);
        take = Math.Clamp(take, 1, 25);
        var (uid, token) = await SessionAsync(ct);
        var repo = (await github.GetAsync<GitHubApiClient.Repo>(token, uid, $"/repos/{owner}/{name}", ct)).Value;
        var commits = (await github.GetAsync<List<GitHubApiClient.CommitItem>>(token, uid,
            $"/repos/{owner}/{name}/commits?per_page={take}", ct)).Value;
        var totals = await TotalsAsync(token, uid, owner, name, ct);
        return new CommitsDto(repo.DefaultBranch, totals.Commits, commits.Select(ToDto).ToList());
    }

    public async Task<PullsDto> PullsAsync(string owner, string name, int take, CancellationToken ct)
    {
        Validate(owner, name);
        take = Math.Clamp(take, 1, 25);
        var (uid, token) = await SessionAsync(ct);
        var pulls = (await github.GetAsync<List<GitHubApiClient.Pull>>(token, uid,
            $"/repos/{owner}/{name}/pulls?state=open&sort=updated&direction=desc&per_page={take}", ct)).Value;
        var totals = await TotalsAsync(token, uid, owner, name, ct);
        return new PullsDto(totals.PrsOpen, totals.PrsClosed, totals.PrsMerged, pulls.Select(p => new PullDto(
            p.Number, p.Title, p.User?.Login ?? "ghost", p.Head?.Ref ?? "?", p.Draft, p.UpdatedAt, p.HtmlUrl)).ToList());
    }

    public async Task<RateDto> RateAsync(CancellationToken ct)
    {
        var (_, token) = await SessionAsync(ct);
        var r = (await github.GetRateLimitAsync(token, ct)).Resources;
        return new RateDto(ToDto(r.Core)!, ToDto(r.Search), ToDto(r.Graphql));
    }

    private async Task<TotalsDto> TotalsAsync(string token, Guid uid, string owner, string name, CancellationToken ct)
    {
        var data = await github.GraphQlAsync<GitHubApiClient.TotalsData>(token, uid, TotalsQuery, new { owner, name }, ct);
        var repo = data.Repository ?? throw ApiError.NotFound("REPO_NOT_FOUND", $"no repository {owner}/{name}");
        return new TotalsDto(
            repo.DefaultBranchRef?.Target?.History?.TotalCount ?? 0,
            repo.Open.TotalCount, repo.Closed.TotalCount, repo.Merged.TotalCount);
    }

    [GeneratedRegex("^[A-Za-z0-9_.-]{1,100}$")]
    private static partial Regex Segment();

    private static void Validate(string owner, string name)
    {
        if (!Segment().IsMatch(owner) || !Segment().IsMatch(name) || owner is "." or ".." || name is "." or "..")
            throw ApiError.Invalid("INVALID_REPO", "repository must be owner/name using [A-Za-z0-9_.-]");
    }

    private static CommitDto ToDto(GitHubApiClient.CommitItem c) => new(
        c.Sha, c.Author?.Login ?? c.Detail.Author?.Name ?? "unknown",
        c.Detail.Message, c.Detail.Author?.Date, c.HtmlUrl);

    private static RateBucketDto? ToDto(GitHubApiClient.RateBucket? b) => b is null ? null
        : new RateBucketDto(b.Limit, b.Remaining, b.Used, DateTimeOffset.FromUnixTimeSeconds(b.Reset).UtcDateTime);
}
