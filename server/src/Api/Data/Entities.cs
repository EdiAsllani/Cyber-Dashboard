namespace Api.Data;

/*
 * The wallet domain (ARCHITECTURE §5). Conventions that matter:
 *  - every DateTime is UTC (Npgsql timestamptz refuses anything else);
 *    salary timestamps are bucketed into calendar windows in the user's
 *    timezone at *read* time (D-11), never stored pre-bucketed.
 *  - money is numeric(14,2); the signed Transaction rows are the source of
 *    truth — Balance and FundedAmount are running sums kept in lockstep by
 *    WalletService (money conservation invariant).
 */

public class User
{
    public Guid Id { get; set; }
    public string Handle { get; set; } = "";
    /// <summary>Null until Phase 5 links a GitHub identity (D-06).</summary>
    public long? GitHubId { get; set; }
    public string? GitHubLogin { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Account
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "";
    public string Alias { get; set; } = "";
    public decimal Balance { get; set; }
    public decimal SalaryAmount { get; set; }
    public DateTime? SalaryLastClaimedAt { get; set; }
    /// <summary>The once-per-window `salary --force` slot (D-11).</summary>
    public DateTime? SalaryLastForcedAt { get; set; }
    /// <summary>Postgres xmin — optimistic concurrency token.</summary>
    public uint Version { get; set; }
}

public enum TransactionKind { Pay, Income, Salary, BudgetFund, BudgetRefund }

public class Transaction
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    /// <summary>Set on BudgetFund/BudgetRefund rows only.</summary>
    public Guid? BudgetId { get; set; }
    /// <summary>Signed: credits positive, debits (incl. escrow funding) negative.</summary>
    public decimal Amount { get; set; }
    public TransactionKind Kind { get; set; }
    public string Memo { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public enum BudgetStatus { Active, Reached, Cancelled }

public class Budget
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>Terminal-facing id, unique per user — nobody types GUIDs into a CRT.</summary>
    public int Seq { get; set; }
    public string Name { get; set; } = "";
    public decimal TargetAmount { get; set; }
    public decimal FundedAmount { get; set; }
    public BudgetStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public uint Version { get; set; }
}

/// <summary>
/// Storage for registry keys that don't write through to a real column
/// (D-13). The registry in Wallet/SettingsRegistry.cs is the only writer.
/// </summary>
public class UserSetting
{
    public Guid UserId { get; set; }
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}
