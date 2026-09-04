namespace Api;

/// <summary>
/// A refused request, as a typed error the middleware turns into 4xx/5xx JSON
/// `{ code, message, meta? }`. Every feature throws these — wallet invariants,
/// auth refusals, GitHub uplink failures. The server owns the refusal, the
/// client owns the drama (D-03): messages here are neutral fallbacks, the
/// terminal maps `Code` to themed output.
/// </summary>
public sealed class ApiError(int status, string code, string message, object? meta = null)
    : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public object? Meta { get; } = meta;

    public static ApiError Invalid(string code, string message, object? meta = null) =>
        new(400, code, message, meta);

    public static ApiError NotFound(string code, string message) => new(404, code, message);

    public static ApiError Unauthorized(string code, string message) => new(401, code, message);

    public static ApiError Conflict(string code, string message, object? meta = null) =>
        new(409, code, message, meta);
}
