using Microsoft.EntityFrameworkCore;
using SearchApi.Models;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<SearchIndex> SearchIndex { get; set; }
    public DbSet<SearchHistory> SearchHistory { get; set; }
    public DbSet<Suggestion> Suggestions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Mark the Suggestion entity as keyless
        modelBuilder.Entity<Suggestion>().HasNoKey();
    }
}
