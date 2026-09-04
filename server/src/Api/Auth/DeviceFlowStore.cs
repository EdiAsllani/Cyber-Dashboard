using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Auth;

/// <summary>
/// Pending device ceremonies, keyed by an opaque handle the browser holds.
/// GitHub's real <c>device_code</c> never leaves the server. Entries die with
/// the process — a ceremony is a few minutes long, so nothing needs Postgres.
/// </summary>
public sealed class DeviceFlowStore(IMemoryCache cache)
{
    public sealed class Pending
    {
        public required string DeviceCode { get; init; }
        public required string UserCode { get; init; }
        public required string VerificationUri { get; init; }
        public required DateTime ExpiresAt { get; init; }
        /// <summary>Seconds between GitHub polls; widened on slow_down.</summary>
        public int Interval { get; set; }
        public DateTime? LastPolledAt { get; set; }
    }

    public string Add(Pending pending)
    {
        var handle = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        cache.Set(Key(handle), pending, pending.ExpiresAt);
        return handle;
    }

    public Pending? Find(string handle) =>
        cache.TryGetValue(Key(handle), out Pending? p) ? p : null;

    public void Remove(string handle) => cache.Remove(Key(handle));

    private static string Key(string handle) => $"device:{handle}";
}
