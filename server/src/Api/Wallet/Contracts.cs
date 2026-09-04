namespace Api.Wallet;

// Request/response shapes for ARCHITECTURE §6. Serialized camelCase by the
// minimal-API defaults; money stays decimal end-to-end.

public record PayRequest(decimal Amount, string? Memo);

public record SalaryRequest(bool Force = false);

public record CreateBudgetRequest(string Name, decimal Target);

public record FundRequest(decimal Amount);

public record SetSettingRequest(string Value);

public record MeDto(string Handle, string? GitHubLogin, string Provider, string Alias);

public record SalaryStatusDto(
    decimal Amount, string Cadence, string Window, bool Claimable, bool ForceAvailable);

public record WalletDto(string Provider, string Alias, decimal Balance, SalaryStatusDto Salary);

public record TransactionDto(
    string Kind, decimal Amount, string Memo, int? BudgetSeq, DateTime CreatedAt);

/// <summary>A just-written pay/income row plus the balance it left behind.</summary>
public record TxResultDto(string Kind, decimal Amount, string Memo, DateTime CreatedAt, decimal Balance);

public record SalaryResultDto(decimal Amount, decimal Balance, string Window, bool Forced);

public record BudgetDto(
    int Seq, string Name, decimal Target, decimal Funded, string Status,
    DateTime CreatedAt, DateTime? ClosedAt);

public record FundResultDto(BudgetDto Budget, decimal Moved, bool Clamped, bool Reached, decimal Balance);

public record CancelResultDto(BudgetDto Budget, decimal Refunded, decimal Balance);

public record TopExpenseDto(string Memo, decimal Amount);

public record StatsDto(
    string Window, decimal Income, decimal Spend, decimal Net, int TxCount,
    TopExpenseDto? TopExpense, decimal Escrowed, decimal AllTimeIncome, decimal AllTimeSpend);

public record SettingDto(string Key, string Value, string Default, string Allowed, string Description);
