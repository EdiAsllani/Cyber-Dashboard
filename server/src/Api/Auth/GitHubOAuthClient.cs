using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Api.Auth;

/// <summary>
/// The two OAuth endpoints the device flow needs (D-14), against
/// <c>GitHub:OAuthBaseUrl</c> (github.com in life, the stub in offline dev).
/// No client secret is involved anywhere — the device grant only carries the
/// public client id, which is why it is the one OAuth shape that can live
/// entirely inside the CRT.
/// </summary>
public sealed class GitHubOAuthClient(HttpClient http, IConfiguration cfg, ILogger<GitHubOAuthClient> log)
{
    public const string Scopes = "read:user repo";
    public const string DeviceGrant = "urn:ietf:params:oauth:grant-type:device_code";

    private string ClientId => cfg["GitHub:ClientId"] ?? "";
    public bool Configured => !string.IsNullOrWhiteSpace(ClientId);

    public sealed record DeviceCode(
        [property: JsonPropertyName("device_code")] string DeviceCodeValue,
        [property: JsonPropertyName("user_code")] string UserCode,
        [property: JsonPropertyName("verification_uri")] string VerificationUri,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("interval")] int Interval);

    /// <summary>One poll outcome. Exactly one of Token / Error is set.</summary>
    public sealed record PollResult(string? Token, string? Error, string? Description);

    private sealed record TokenBody(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("error")] string? Error,
        [property: JsonPropertyName("error_description")] string? ErrorDescription);

    public async Task<DeviceCode> StartAsync(CancellationToken ct)
    {
        if (!Configured)
            throw new ApiError(503, "GITHUB_NOT_CONFIGURED",
                "no GitHub client id — set GITHUB_CLIENT_ID in .env (device flow enabled on the OAuth app)");

        using var res = await SendAsync("/login/device/code", new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["scope"] = Scopes,
        }, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            log.LogWarning("github device/code refused: {Status} {Body}", (int)res.StatusCode, Trim(body));
            throw new ApiError(502, "UPLINK_REFUSED", "github refused to start the device flow",
                new { status = (int)res.StatusCode, error = ErrorField(body) });
        }
        var code = JsonSerializer.Deserialize<DeviceCode>(body);
        if (code is null || string.IsNullOrEmpty(code.DeviceCodeValue))
        {
            // GitHub answers 200 with { error } for a misconfigured app
            // (device_flow_disabled, incorrect_client_credentials).
            throw new ApiError(502, "UPLINK_REFUSED", "github refused to start the device flow",
                new { error = ErrorField(body) });
        }
        return code;
    }

    public async Task<PollResult> PollAsync(string deviceCode, CancellationToken ct)
    {
        using var res = await SendAsync("/login/oauth/access_token", new Dictionary<string, string>
        {
            ["client_id"] = ClientId,
            ["device_code"] = deviceCode,
            ["grant_type"] = DeviceGrant,
        }, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        // Pending polls come back 200 with an error field — branch on the body.
        TokenBody? parsed = null;
        try { parsed = JsonSerializer.Deserialize<TokenBody>(body); } catch (JsonException) { }
        if (parsed?.AccessToken is { Length: > 0 } token) return new PollResult(token, null, null);
        var error = parsed?.Error ?? (res.IsSuccessStatusCode ? "malformed_response" : $"http_{(int)res.StatusCode}");
        return new PollResult(null, error, parsed?.ErrorDescription);
    }

    private async Task<HttpResponseMessage> SendAsync(
        string path, Dictionary<string, string> form, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new FormUrlEncodedContent(form),
        };
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        try
        {
            return await http.SendAsync(req, ct);
        }
        catch (HttpRequestException e)
        {
            log.LogWarning(e, "github oauth unreachable at {Base}", http.BaseAddress);
            throw new ApiError(502, "UPLINK_DOWN", "github unreachable");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiError(502, "UPLINK_DOWN", "github timed out");
        }
    }

    private static string? ErrorField(string body)
    {
        try { return JsonSerializer.Deserialize<TokenBody>(body)?.Error; }
        catch (JsonException) { return null; }
    }

    private static string Trim(string s) => s.Length > 300 ? s[..300] + "…" : s;
}
