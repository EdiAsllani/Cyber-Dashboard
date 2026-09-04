namespace Api.Auth;

/// <summary>
/// ARCHITECTURE §6/§8 as reworked by D-14: no redirects, no callback URL.
/// The browser starts a ceremony, polls it, and ends up with the cookie.
/// All three routes are anonymous — logout is idempotent.
/// </summary>
public static class AuthEndpoints
{
    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        auth.MapPost("/github/device/start", (AuthService a, CancellationToken ct) => a.StartAsync(ct));

        auth.MapPost("/github/device/poll", (DevicePollRequest req, AuthService a, CancellationToken ct) =>
            string.IsNullOrWhiteSpace(req.Handle)
                ? throw ApiError.Invalid("INVALID_HANDLE", "handle required")
                : a.PollAsync(req.Handle, ct));

        auth.MapPost("/logout", async (AuthService a) =>
        {
            await a.LogoutAsync();
            return Results.NoContent();
        });
    }
}

public record DevicePollRequest(string Handle);
