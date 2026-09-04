using Microsoft.EntityFrameworkCore;

namespace Api.Data;

/// <summary>
/// Dev-only seed: the local user Phases 1–4 run as until Phase 5 auth lands
/// (D-06). Idempotent — skips if any user exists. Balance and FundedAmount are
/// *computed* from the seeded transactions, never hand-written, so the money
/// conservation invariant holds by construction.
/// </summary>
public static class DevSeeder
{
    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        if (await db.Users.AnyAsync(ct)) return;

        var now = DateTime.UtcNow;
        var user = new User { Id = Guid.NewGuid(), Handle = "edi", CreatedAt = now };

        var kiroshi = new Budget
        {
            Id = Guid.NewGuid(), UserId = user.Id, Seq = 1,
            Name = "Kiroshi Optics Mk.2", TargetAmount = 5200m,
            Status = BudgetStatus.Active, CreatedAt = now.AddDays(-26),
        };
        var sandevistan = new Budget
        {
            Id = Guid.NewGuid(), UserId = user.Id, Seq = 2,
            Name = "Sandevistan Mk.3", TargetAmount = 28000m,
            Status = BudgetStatus.Active, CreatedAt = now.AddDays(-12),
        };

        var account = new Account
        {
            Id = Guid.NewGuid(), UserId = user.Id,
            Provider = "ARASAKA TRUST", Alias = "NIGHT-CITY-SAVINGS",
            SalaryAmount = 2500m,
            // Last claimed a week ago — a fresh month means `salary` works on
            // first try, and the --force path stays demonstrable afterwards.
            SalaryLastClaimedAt = now.AddDays(-7),
        };

        (int daysAgo, decimal amount, TransactionKind kind, string memo, Guid? budgetId)[] ledger =
        [
            (37, +2500.00m, TransactionKind.Salary, "arasaka payroll // monthly", null),
            (30, -180.50m, TransactionKind.Pay, "ramen at tom's diner", null),
            (27, +950.00m, TransactionKind.Income, "gig: courier run for wakako", null),
            (24, -320.00m, TransactionKind.Pay, "ammo restock // 5.56 hp", null),
            (22, -1500.00m, TransactionKind.BudgetFund, "escrow: kiroshi optics mk.2", kiroshi.Id),
            (20, -75.25m, TransactionKind.Pay, "synth-beer, el coyote cojo", null),
            (7, +2500.00m, TransactionKind.Salary, "arasaka payroll // monthly", null),
            (5, +1200.00m, TransactionKind.Income, "gig: data courier // afterlife", null),
            (4, -700.00m, TransactionKind.BudgetFund, "escrow: kiroshi optics mk.2", kiroshi.Id),
            (2, -49.99m, TransactionKind.Pay, "noodles + synthcaff", null),
        ];

        var transactions = ledger.Select(t => new Transaction
        {
            Id = Guid.NewGuid(), AccountId = account.Id, BudgetId = t.budgetId,
            Amount = t.amount, Kind = t.kind, Memo = t.memo,
            CreatedAt = now.AddDays(-t.daysAgo),
        }).ToList();

        account.Balance = transactions.Sum(t => t.Amount);
        kiroshi.FundedAmount = -transactions
            .Where(t => t.BudgetId == kiroshi.Id && t.Kind == TransactionKind.BudgetFund)
            .Sum(t => t.Amount);

        db.AddRange(user, account, kiroshi, sandevistan);
        db.AddRange(transactions);
        await db.SaveChangesAsync(ct);
    }
}
