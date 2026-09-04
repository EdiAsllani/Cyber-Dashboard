using System.Security.Claims;
using Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Auth;

/// <summary>
/// The session identity (D-06). Scoped: reads the user id claim the cookie
/// principal carries and loads the row on first use. Routes reach this only
/// through <c>RequireAuthorization()</c>, so an unauthenticated request never
/// gets here — the cookie handler already answered 401 — but a cookie that
/// outlives its row (a wiped dev database) is refused with SESSION_INVALID,
/// which the terminal treats exactly like ACCESS DENIED.
/// </summary>
public sealed class CurrentUser(IHttpContextAccessor accessor, AppDbContext db)
{
    public const string IdClaim = "sub";

    private (User User, Account Account)? _loaded;

    public Guid? Id
    {
        get
        {
            var raw = accessor.HttpContext?.User.FindFirstValue(IdClaim);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public async Task<(User User, Account Account)> LoadAsync(CancellationToken ct)
    {
        if (_loaded is { } cached) return cached;
        var id = Id ?? throw ApiError.Unauthorized("ACCESS_DENIED", "no session — run: login");
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id, ct)
            ?? throw ApiError.Unauthorized("SESSION_INVALID", "session points at nobody — run: login");
        var account = await db.Accounts.SingleAsync(a => a.UserId == user.Id, ct);
        _loaded = (user, account);
        return _loaded.Value;
    }

    public static ClaimsPrincipal PrincipalFor(User user) =>
        new(new ClaimsIdentity(
        [
            new Claim(IdClaim, user.Id.ToString()),
            new Claim("handle", user.Handle),
        ], "blackwall"));
}
