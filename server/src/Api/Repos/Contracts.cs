namespace Api.Repos;

// REPO.NET shapes (ARCHITECTURE §6). Serialized camelCase.

public record RepoListItemDto(
    string Owner, string Name, string FullName, bool Private, int Stars, int Forks,
    string? Language, string? Description, DateTime? PushedAt, string DefaultBranch);

public record CommitDto(string Sha, string Author, string Message, DateTime? When, string Url);

public record TotalsDto(int Commits, int PrsOpen, int PrsClosed, int PrsMerged);

public record RepoSummaryDto(
    string Owner, string Name, string FullName, bool Private, string? Description,
    string DefaultBranch, int Stars, int Forks, int Watchers, int OpenIssues, string? Language,
    DateTime? CreatedAt, DateTime? PushedAt, string Url, CommitDto? Latest, TotalsDto Totals);

public record CommitsDto(string DefaultBranch, int Total, List<CommitDto> Items);

public record PullDto(int Number, string Title, string Author, string Branch, bool Draft, DateTime UpdatedAt, string Url);

public record PullsDto(int Open, int Closed, int Merged, List<PullDto> Items);

public record RateBucketDto(int Limit, int Remaining, int Used, DateTime ResetAt);

public record RateDto(RateBucketDto Core, RateBucketDto? Search, RateBucketDto? Graphql);
