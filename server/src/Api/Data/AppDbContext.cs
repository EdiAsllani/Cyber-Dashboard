using Microsoft.EntityFrameworkCore;

namespace Api.Data;

// Entities arrive in Phase 4 (wallet/budgets) and Phase 5 (users).
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options);
