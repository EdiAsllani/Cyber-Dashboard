using Api.Data;
using Api.Repos;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Api.Auth;

/// <summary>
/// The device ceremony end to end (D-14) plus what happens once GitHub says
/// yes: user upsert with the seed-account claim (plan §3), token vault, cookie
/// sign-in. One transaction per completed login.
/// </summary>
public sealed class AuthService(
    AppDbContext db,
    GitHubOAuthClient oauth,
    GitHubApiClient github,
    DeviceFlowStore store,
    IDataProtectionProvider protection,
    IHttpContextAccessor accessor,
    ILogger<AuthService> log)
{
    public const string TokenPurpose = "github-token";
    private const decimal WelcomeBonus = 2077.00m;

    public async Task<DeviceStartDto> StartAsync(CancellationToken ct)
    {
        var code = await oauth.StartAsync(ct);
        var handle = store.Add(new DeviceFlowStore.Pending
        {
            DeviceCode = code.DeviceCodeValue,
            UserCode = code.UserCode,
            VerificationUri = code.VerificationUri,
            ExpiresAt = DateTime.UtcNow.AddSeconds(code.ExpiresIn),
            Interval = Math.Max(1, code.Interval),
        });
        log.LogInformation("device flow started // user code {UserCode}, expires in {Expires}s",
            code.UserCode, code.ExpiresIn);
        return new DeviceStartDto(handle, code.UserCode, code.VerificationUri, code.ExpiresIn, code.Interval);
    }

    public async Task<DevicePollDto> PollAsync(string handle, CancellationToken ct)
    {
        var pending = store.Find(handle)
            ?? throw new ApiError(410, "DEVICE_EXPIRED", "that device code is gone — run: login");

        var now = DateTime.UtcNow;
        if (now >= pending.ExpiresAt)
        {
            store.Remove(handle);
            throw new ApiError(410, "DEVICE_EXPIRED", "device code expired — run: login");
        }
        // GitHub's interval is enforced here so an eager client can never
        // earn a slow_down: early polls are answered from memory.
        if (pending.LastPolledAt is { } last && (now - last).TotalSeconds < pending.Interval)
            return DevicePollDto.Pending(pending.Interval);
        pending.LastPolledAt = now;

        var result = await oauth.PollAsync(pending.DeviceCode, ct);
        if (result.Token is { } token)
        {
            store.Remove(handle);
            var me = await CompleteAsync(token, ct);
            return DevicePollDto.Complete(me);
        }

        switch (result.Error)
        {
            case "authorization_pending":
                return DevicePollDto.Pending(pending.Interval);
            case "slow_down":
                pending.Interval += 5;
                return DevicePollDto.Pending(pending.Interval);
            case "expired_token":
                store.Remove(handle);
                throw new ApiError(410, "DEVICE_EXPIRED", "device code expired — run: login");
            case "access_denied":
                store.Remove(handle);
                throw new ApiError(403, "DEVICE_DENIED", "you declined the authorization on github");
            default:
                store.Remove(handle);
                log.LogWarning("device poll failed: {Error} {Description}", result.Error, result.Description);
                throw new ApiError(502, "UPLINK_REFUSED", "github refused the device grant",
                    new { error = result.Error });
        }
    }

    /// <summary>Token in hand: identify, upsert (claiming the seed if unlinked), vault, sign in.</summary>
    private async Task<LoginResultDto> CompleteAsync(string token, CancellationToken ct)
    {
        var gh = await github.GetViewerAsync(token, ct);
        var now = DateTime.UtcNow;
        var cipher = protection.CreateProtector(TokenPurpose).Protect(token);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var user = await db.Users.SingleOrDefaultAsync(u => u.GitHubId == gh.Id, ct);
        var outcome = "returning";
        if (user is null)
        {
            // Plan §3 step 2: the oldest unlinked user is the dev seed — the
            // first GitHub identity through the door inherits its ledger.
            user = await db.Users.Where(u => u.GitHubId == null).OrderBy(u => u.CreatedAt)
                .FirstOrDefaultAsync(ct);
            if (user is not null)
            {
                outcome = "claimed";
                user.GitHubId = gh.Id;
                user.GitHubLinkedAt = now;
            }
        }
        if (user is null)
        {
            outcome = "created";
            user = new User
            {
                Id = Guid.NewGuid(), GitHubId = gh.Id, CreatedAt = now, GitHubLinkedAt = now,
            };
            var account = new Account
            {
                Id = Guid.NewGuid(), UserId = user.Id,
                Provider = "ARASAKA TRUST", Alias = "NIGHT-CITY-SAVINGS", SalaryAmount = 2500m,
            };
            var welcome = new Transaction
            {
                Id = Guid.NewGuid(), AccountId = account.Id, Amount = WelcomeBonus,
                Kind = TransactionKind.Income, Memo = "arasaka trust // welcome bonus", CreatedAt = now,
            };
            account.Balance = welcome.Amount;
            db.AddRange(user, account, welcome);
        }

        user.Handle = gh.Login;
        user.GitHubLogin = gh.Login;
        user.AvatarUrl = gh.AvatarUrl;
        user.GitHubTokenCipher = cipher;
        user.LastLoginAt = now;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var http = accessor.HttpContext ?? throw new InvalidOperationException("no http context");
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            CurrentUser.PrincipalFor(user),
            new AuthenticationProperties { IsPersistent = true });

        log.LogInformation("login // {Login} ({Outcome})", gh.Login, outcome);
        return new LoginResultDto(user.Handle, gh.Login, gh.AvatarUrl, outcome);
    }

    public async Task LogoutAsync()
    {
        var http = accessor.HttpContext ?? throw new InvalidOperationException("no http context");
        await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }

    /// <summary>Decrypt the vaulted token for REPO.NET calls.</summary>
    public string? TokenFor(User user)
    {
        if (user.GitHubTokenCipher is null) return null;
        try
        {
            return protection.CreateProtector(TokenPurpose).Unprotect(user.GitHubTokenCipher);
        }
        catch (System.Security.Cryptography.CryptographicException e)
        {
            // Key ring rotated away from under a stored token — treat as unlinked.
            log.LogWarning(e, "could not unprotect github token for {Handle}", user.Handle);
            return null;
        }
    }
}

public record DeviceStartDto(string Handle, string UserCode, string VerificationUri, int ExpiresIn, int Interval);

public record LoginResultDto(string Handle, string GitHubLogin, string? AvatarUrl, string Outcome);

public record DevicePollDto(string Status, int? RetryIn, LoginResultDto? User)
{
    public static DevicePollDto Pending(int interval) => new("pending", interval, null);
    public static DevicePollDto Complete(LoginResultDto user) => new("complete", null, user);
}
