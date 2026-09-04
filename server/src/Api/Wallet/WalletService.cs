using Api.Auth;
using Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Wallet;

/// <summary>
/// The one transactional owner of every balance mutation (ARCHITECTURE §5).
/// Each operation is a single SaveChanges (atomic), with xmin tokens turning
/// racing writers into DbUpdateConcurrencyException → 409. "Current user" is
/// the cookie session (D-06) — the routes are behind RequireAuthorization.
/// </summary>
public sealed class WalletService(AppDbContext db, CurrentUser current)
{
    private const decimal MaxAmount = 10_000_000m;

    private Task<(User User, Account Account)> CurrentAsync(CancellationToken ct) => current.LoadAsync(ct);

    public async Task<MeDto> MeAsync(CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        return new MeDto(user.Handle, user.GitHubLogin, user.AvatarUrl, user.GitHubLinkedAt,
            account.Provider, account.Alias);
    }

    // ---- wallet ----

    public async Task<WalletDto> WalletAsync(TimeZoneInfo tz, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        return new WalletDto(account.Provider, account.Alias, account.Balance,
            await SalaryStatusAsync(user, account, tz, ct));
    }

    private async Task<SalaryStatusDto> SalaryStatusAsync(
        User user, Account account, TimeZoneInfo tz, CancellationToken ct)
    {
        var cadence = await SettingValueAsync(user.Id, "wallet.salary.cadence", ct);
        var now = DateTime.UtcNow;
        var claimed = SalaryWindow.SameWindow(account.SalaryLastClaimedAt, now, cadence, tz);
        var forced = SalaryWindow.SameWindow(account.SalaryLastForcedAt, now, cadence, tz);
        return new SalaryStatusDto(
            account.SalaryAmount, cadence, SalaryWindow.KeyFor(now, cadence, tz),
            Claimable: !claimed, ForceAvailable: claimed && !forced);
    }

    public async Task<TxResultDto> PayAsync(decimal amount, string? memo, CancellationToken ct)
    {
        ValidateAmount(amount);
        var (_, account) = await CurrentAsync(ct);
        if (account.Balance < amount)
            throw ApiError.Conflict("OVERDRAFT", "insufficient funds",
                new { balance = account.Balance, attempted = amount });
        var tx = Write(account, -amount, TransactionKind.Pay, memo ?? "unlogged debit");
        await db.SaveChangesAsync(ct);
        return new TxResultDto(tx.Kind.ToString(), tx.Amount, tx.Memo, tx.CreatedAt, account.Balance);
    }

    public async Task<TxResultDto> IncomeAsync(decimal amount, string? memo, CancellationToken ct)
    {
        ValidateAmount(amount);
        var (_, account) = await CurrentAsync(ct);
        var tx = Write(account, amount, TransactionKind.Income, memo ?? "unlogged credit");
        await db.SaveChangesAsync(ct);
        return new TxResultDto(tx.Kind.ToString(), tx.Amount, tx.Memo, tx.CreatedAt, account.Balance);
    }

    /// <summary>D-11: one normal claim per calendar window (user tz), one more via force.</summary>
    public async Task<SalaryResultDto> ClaimSalaryAsync(bool force, TimeZoneInfo tz, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        var cadence = await SettingValueAsync(user.Id, "wallet.salary.cadence", ct);
        var now = DateTime.UtcNow;
        var window = SalaryWindow.KeyFor(now, cadence, tz);

        var claimed = SalaryWindow.SameWindow(account.SalaryLastClaimedAt, now, cadence, tz);
        var forced = false;
        if (!claimed)
        {
            // Force with the normal slot unused is just a claim — it's an
            // override, not a separate paycheck.
            account.SalaryLastClaimedAt = now;
        }
        else if (!force)
        {
            throw ApiError.Conflict("SALARY_ALREADY_CLAIMED", "salary already claimed this window",
                new { window, cadence });
        }
        else if (SalaryWindow.SameWindow(account.SalaryLastForcedAt, now, cadence, tz))
        {
            throw ApiError.Conflict("SALARY_FORCE_EXHAUSTED", "force claim already used this window",
                new { window, cadence });
        }
        else
        {
            account.SalaryLastForcedAt = now;
            forced = true;
        }

        Write(account, account.SalaryAmount, TransactionKind.Salary,
            forced ? "arasaka payroll // FORCED DISBURSEMENT" : "arasaka payroll // monthly");
        await db.SaveChangesAsync(ct);
        return new SalaryResultDto(account.SalaryAmount, account.Balance, window, forced);
    }

    public async Task<List<TransactionDto>> TransactionsAsync(
        int? take, string? kind, int? budgetSeq, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        var q = db.Transactions.AsNoTracking().Where(t => t.AccountId == account.Id);

        if (kind is not null)
        {
            if (!Enum.TryParse<TransactionKind>(kind, ignoreCase: true, out var k))
                throw ApiError.Invalid("INVALID_FILTER", $"unknown kind '{kind}'",
                    new { allowed = Enum.GetNames<TransactionKind>() });
            q = q.Where(t => t.Kind == k);
        }
        if (budgetSeq is { } seq)
        {
            var budget = await FindBudgetAsync(user.Id, seq, ct);
            q = q.Where(t => t.BudgetId == budget.Id);
        }

        var n = take ?? int.Parse(await SettingValueAsync(user.Id, "wallet.history.pagesize", ct));
        n = Math.Clamp(n, 1, 100);

        // An inner join would drop rows with a null BudgetId, so fetch the
        // plain and budget-linked rows separately and merge.
        var plain = await q.Where(t => t.BudgetId == null)
            .OrderByDescending(t => t.CreatedAt).Take(n).ToListAsync(ct);
        var linked = await q.Where(t => t.BudgetId != null)
            .OrderByDescending(t => t.CreatedAt).Take(n)
            .Join(db.Budgets, t => t.BudgetId, b => b.Id, (t, b) => new { t, b.Seq })
            .ToListAsync(ct);

        return plain.Select(t => ToDto(t, null))
            .Concat(linked.Select(x => ToDto(x.t, x.Seq)))
            .OrderByDescending(t => t.CreatedAt)
            .Take(n)
            .ToList();
    }

    /// <summary>Stats always use the calendar month (user tz) — a spending month,
    /// independent of the salary cadence.</summary>
    public async Task<StatsDto> StatsAsync(TimeZoneInfo tz, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var monthStartUtc = TimeZoneInfo.ConvertTimeToUtc(
            new DateTime(nowLocal.Year, nowLocal.Month, 1, 0, 0, 0, DateTimeKind.Unspecified), tz);

        var all = await db.Transactions.AsNoTracking()
            .Where(t => t.AccountId == account.Id)
            .Select(t => new { t.Amount, t.Kind, t.Memo, t.CreatedAt })
            .ToListAsync(ct);

        var window = all.Where(t => t.CreatedAt >= monthStartUtc).ToList();
        decimal income = window.Where(t => t.Kind is TransactionKind.Income or TransactionKind.Salary)
            .Sum(t => t.Amount);
        decimal spend = -window.Where(t => t.Kind == TransactionKind.Pay).Sum(t => t.Amount);
        var top = window.Where(t => t.Kind == TransactionKind.Pay)
            .OrderBy(t => t.Amount).FirstOrDefault();

        var escrowed = await db.Budgets.AsNoTracking()
            .Where(b => b.UserId == user.Id && b.Status != BudgetStatus.Cancelled)
            .SumAsync(b => b.FundedAmount, ct);

        return new StatsDto(
            Window: $"{nowLocal.Year:D4}-{nowLocal.Month:D2}",
            Income: income, Spend: spend, Net: income - spend, TxCount: window.Count,
            TopExpense: top is null ? null : new TopExpenseDto(top.Memo, -top.Amount),
            Escrowed: escrowed,
            AllTimeIncome: all.Where(t => t.Kind is TransactionKind.Income or TransactionKind.Salary)
                .Sum(t => t.Amount),
            AllTimeSpend: -all.Where(t => t.Kind == TransactionKind.Pay).Sum(t => t.Amount));
    }

    // ---- budgets ----

    public async Task<List<BudgetDto>> BudgetsAsync(CancellationToken ct)
    {
        var (user, _) = await CurrentAsync(ct);
        return await db.Budgets.AsNoTracking()
            .Where(b => b.UserId == user.Id)
            .OrderBy(b => b.Seq)
            .Select(b => ToDto(b))
            .ToListAsync(ct);
    }

    public async Task<BudgetDto> CreateBudgetAsync(string name, decimal target, CancellationToken ct)
    {
        var trimmed = name.Trim();
        if (trimmed.Length is < 1 or > 64)
            throw ApiError.Invalid("INVALID_NAME", "budget name must be 1..64 chars");
        ValidateAmount(target);
        var (user, _) = await CurrentAsync(ct);
        var seq = (await db.Budgets.Where(b => b.UserId == user.Id)
            .MaxAsync(b => (int?)b.Seq, ct) ?? 0) + 1;
        var budget = new Budget
        {
            Id = Guid.NewGuid(), UserId = user.Id, Seq = seq, Name = trimmed,
            TargetAmount = target, Status = BudgetStatus.Active, CreatedAt = DateTime.UtcNow,
        };
        db.Add(budget);
        await db.SaveChangesAsync(ct);
        return ToDto(budget);
    }

    /// <summary>Escrow Balance → FundedAmount, clamped to the remaining target;
    /// the call that crosses the target flips the budget to Reached (D-12).</summary>
    public async Task<FundResultDto> FundAsync(int seq, decimal amount, CancellationToken ct)
    {
        ValidateAmount(amount);
        var (user, account) = await CurrentAsync(ct);
        var budget = await FindBudgetAsync(user.Id, seq, ct);
        if (budget.Status != BudgetStatus.Active)
            throw ApiError.Conflict("BUDGET_NOT_ACTIVE",
                $"budget is {budget.Status}", new { status = budget.Status.ToString() });

        var remaining = budget.TargetAmount - budget.FundedAmount;
        var moved = Math.Min(amount, remaining);
        if (account.Balance < moved)
            throw ApiError.Conflict("OVERDRAFT", "insufficient funds",
                new { balance = account.Balance, attempted = moved });

        Write(account, -moved, TransactionKind.BudgetFund, $"escrow: {budget.Name}", budget.Id);
        budget.FundedAmount += moved;
        var reached = budget.FundedAmount >= budget.TargetAmount;
        if (reached)
        {
            budget.Status = BudgetStatus.Reached;
            budget.ClosedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        return new FundResultDto(ToDto(budget), moved, Clamped: moved < amount, reached, account.Balance);
    }

    /// <summary>Refund the escrow and close. Legal on Active *and* Reached —
    /// cancelling a Reached budget is how escrow is reclaimed after the
    /// real-life purchase (D-12).</summary>
    public async Task<CancelResultDto> CancelAsync(int seq, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        var budget = await FindBudgetAsync(user.Id, seq, ct);
        if (budget.Status == BudgetStatus.Cancelled)
            throw ApiError.Conflict("BUDGET_NOT_ACTIVE", "budget already cancelled",
                new { status = budget.Status.ToString() });

        var refund = budget.FundedAmount;
        if (refund > 0)
            Write(account, refund, TransactionKind.BudgetRefund, $"refund: {budget.Name}", budget.Id);
        budget.FundedAmount = 0;
        budget.Status = BudgetStatus.Cancelled;
        budget.ClosedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return new CancelResultDto(ToDto(budget), refund, account.Balance);
    }

    public async Task DeleteBudgetAsync(int seq, CancellationToken ct)
    {
        var (user, _) = await CurrentAsync(ct);
        var budget = await FindBudgetAsync(user.Id, seq, ct);
        if (await db.Transactions.AnyAsync(t => t.BudgetId == budget.Id, ct))
            throw ApiError.Conflict("BUDGET_HAS_HISTORY",
                "budget has transactions — cancel it instead");
        db.Remove(budget);
        await db.SaveChangesAsync(ct);
    }

    // ---- config (D-13) ----

    public async Task<List<SettingDto>> SettingsAsync(CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        var rows = await db.UserSettings.AsNoTracking()
            .Where(s => s.UserId == user.Id).ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return SettingsRegistry.All
            .Select(d => ToDto(d, d.FromAccount?.Invoke(account) ?? rows.GetValueOrDefault(d.Key, d.Default)))
            .ToList();
    }

    public async Task<SettingDto> SetSettingAsync(string key, string value, CancellationToken ct)
    {
        var def = SettingsRegistry.Find(key)
            ?? throw ApiError.Invalid("UNKNOWN_SETTING", $"unknown key '{key}'",
                new { known = SettingsRegistry.All.Select(d => d.Key) });
        var normalized = def.Normalize(value)
            ?? throw ApiError.Invalid("INVALID_SETTING_VALUE",
                $"invalid value for {def.Key}", new { allowed = def.Allowed });
        await ApplyAsync(def, normalized, ct);
        return ToDto(def, normalized);
    }

    public async Task<SettingDto> ResetSettingAsync(string key, CancellationToken ct)
    {
        var def = SettingsRegistry.Find(key)
            ?? throw ApiError.Invalid("UNKNOWN_SETTING", $"unknown key '{key}'",
                new { known = SettingsRegistry.All.Select(d => d.Key) });
        await ApplyAsync(def, def.Default, ct);
        return ToDto(def, def.Default);
    }

    private async Task ApplyAsync(SettingsRegistry.Def def, string value, CancellationToken ct)
    {
        var (user, account) = await CurrentAsync(ct);
        if (def.ToAccount is not null)
        {
            def.ToAccount(account, value);
        }
        else
        {
            var row = await db.UserSettings.FindAsync([user.Id, def.Key], ct);
            if (row is null) db.Add(new UserSetting { UserId = user.Id, Key = def.Key, Value = value });
            else row.Value = value;
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task<string> SettingValueAsync(Guid userId, string key, CancellationToken ct)
    {
        var def = SettingsRegistry.Find(key)!;
        var row = await db.UserSettings.AsNoTracking()
            .SingleOrDefaultAsync(s => s.UserId == userId && s.Key == def.Key, ct);
        return row?.Value ?? def.Default;
    }

    // ---- helpers ----

    private static void ValidateAmount(decimal amount)
    {
        if (amount <= 0 || amount > MaxAmount || decimal.Round(amount, 2) != amount)
            throw ApiError.Invalid("INVALID_AMOUNT",
                "amount must be positive, max 2 decimals, at most 10,000,000",
                new { attempted = amount });
    }

    /// <summary>Every money movement goes through here: one signed row + the
    /// running balance, in the same unit of work.</summary>
    private Transaction Write(Account account, decimal amount, TransactionKind kind,
        string memo, Guid? budgetId = null)
    {
        account.Balance += amount;
        var tx = new Transaction
        {
            Id = Guid.NewGuid(), AccountId = account.Id, BudgetId = budgetId,
            Amount = amount, Kind = kind,
            Memo = memo.Length > 140 ? memo[..140] : memo,
            CreatedAt = DateTime.UtcNow,
        };
        db.Add(tx);
        return tx;
    }

    private async Task<Budget> FindBudgetAsync(Guid userId, int seq, CancellationToken ct) =>
        await db.Budgets.SingleOrDefaultAsync(b => b.UserId == userId && b.Seq == seq, ct)
            ?? throw ApiError.NotFound("BUDGET_NOT_FOUND", $"no budget #{seq}");

    private static TransactionDto ToDto(Transaction t, int? budgetSeq) =>
        new(t.Kind.ToString(), t.Amount, t.Memo, budgetSeq, t.CreatedAt);

    private static BudgetDto ToDto(Budget b) =>
        new(b.Seq, b.Name, b.TargetAmount, b.FundedAmount, b.Status.ToString(), b.CreatedAt, b.ClosedAt);

    private static SettingDto ToDto(SettingsRegistry.Def d, string value) =>
        new(d.Key, value, d.Default, d.Allowed, d.Description);
}
