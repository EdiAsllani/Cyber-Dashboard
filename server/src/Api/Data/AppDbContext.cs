using Microsoft.EntityFrameworkCore;

namespace Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<Budget> Budgets => Set<Budget>();
    public DbSet<UserSetting> UserSettings => Set<UserSetting>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.Property(x => x.Handle).HasMaxLength(64);
            e.Property(x => x.GitHubLogin).HasMaxLength(128);
            e.Property(x => x.AvatarUrl).HasMaxLength(512);
            e.HasIndex(x => x.GitHubId).IsUnique();
        });

        b.Entity<Account>(e =>
        {
            e.Property(x => x.Provider).HasMaxLength(64);
            e.Property(x => x.Alias).HasMaxLength(64);
            e.Property(x => x.Balance).HasPrecision(14, 2);
            e.Property(x => x.SalaryAmount).HasPrecision(14, 2);
            // Postgres xmin as the optimistic concurrency token (D-08).
            e.Property(x => x.Version).IsRowVersion();
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne<User>().WithOne().HasForeignKey<Account>(x => x.UserId);
        });

        b.Entity<Transaction>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(14, 2);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Memo).HasMaxLength(140);
            e.HasIndex(x => new { x.AccountId, x.CreatedAt });
            e.HasOne<Account>().WithMany().HasForeignKey(x => x.AccountId);
            // Restrict, not cascade: "delete only if never used" is enforced in
            // the service, and the FK backs it up at the database layer.
            e.HasOne<Budget>().WithMany().HasForeignKey(x => x.BudgetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Budget>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(64);
            e.Property(x => x.TargetAmount).HasPrecision(14, 2);
            e.Property(x => x.FundedAmount).HasPrecision(14, 2);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Version).IsRowVersion();
            e.HasIndex(x => new { x.UserId, x.Seq }).IsUnique();
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId);
        });

        b.Entity<UserSetting>(e =>
        {
            e.HasKey(x => new { x.UserId, x.Key });
            e.Property(x => x.Key).HasMaxLength(64);
            e.Property(x => x.Value).HasMaxLength(256);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId);
        });
    }
}
