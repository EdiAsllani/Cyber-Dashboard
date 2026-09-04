namespace Api.Wallet;

/// <summary>
/// A refused invariant, as a typed error the middleware turns into 4xx JSON
/// `{ code, message, meta? }`. The server owns the refusal, the client owns
/// the drama (D-03) — messages here are neutral fallbacks, the terminal maps
/// `Code` to themed output.
/// </summary>
public sealed class WalletError(int status, string code, string message, object? meta = null)
    : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public object? Meta { get; } = meta;

    public static WalletError Invalid(string code, string message, object? meta = null) =>
        new(400, code, message, meta);

    public static WalletError NotFound(string code, string message) => new(404, code, message);

    public static WalletError Conflict(string code, string message, object? meta = null) =>
        new(409, code, message, meta);
}
