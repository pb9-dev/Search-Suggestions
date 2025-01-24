using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using SearchApi.Models;
using Microsoft.Data.SqlClient;

namespace SearchApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SearchController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IDatabase _redisCache;

        public SearchController(AppDbContext context, IConnectionMultiplexer redis)
        {
            _context = context;
            _redisCache = redis.GetDatabase();
        }

        [HttpGet]
        public async Task<IActionResult> GetSuggestions(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            if (query.Trim().Length <= 2)
                return BadRequest("Suggestions are available only for queries with more than 3 letters.");

            // Checking Redis cache
            var cacheKey = $"suggestions:{query.ToLower()}";
            var cachedSuggestions = await _redisCache.StringGetAsync(cacheKey);
            if (!cachedSuggestions.IsNullOrEmpty)
            {
                Console.WriteLine($"Data fetched from Redis cache for query: {query}");
                var cachedResults = cachedSuggestions.ToString().Split('|');
                return Ok(cachedResults.Select(result => new { Text = result, IsHistory = false }));
            }

            Console.WriteLine($"Cache miss for query: {query}. Fetching data from the stored procedure.");

            // Executing the stored procedure and returning results
            var allSuggestions = await _context.Suggestions
                .FromSqlInterpolated($"EXEC GetSuggestions @Query = {query}")
                .ToListAsync();

            // Process the results
            var processedSuggestions = allSuggestions
                .AsEnumerable()
                .SelectMany(s => s.Text.Split(',').Select(w => new { Text = w.Trim(), IsHistory = s.IsHistory }))
                .Where(word =>
                {
                    if (word.Text.Contains(" ")) // multi-word suggestion
                    {
                        // Check if any word in the multi-word suggestion matches the query completely
                        var words = word.Text.Split(' ');
                        return words.Any(w => w.StartsWith(query, StringComparison.OrdinalIgnoreCase));
                    }

                    // For single-word suggestions, check if it starts with the query
                    return word.Text.StartsWith(query, StringComparison.OrdinalIgnoreCase);
                })
                .GroupBy(word => word.Text.ToLower())
                .Select(group => group.First())
                .OrderByDescending(word => word.IsHistory)
                .Take(10);

            var result = processedSuggestions.ToList();

            // Store the result in Redis cache
            await _redisCache.StringSetAsync(cacheKey, string.Join("|", result.Select(r => r.Text)), TimeSpan.FromMinutes(5));

            return Ok(result);
        }

        [HttpPost("LogSearch")]
        public async Task<IActionResult> LogSearch([FromBody] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            var existingEntry = await _context.SearchHistory
                .FirstOrDefaultAsync(sh => sh.Query == query.Trim());

            if (existingEntry != null)
            {
                existingEntry.Timestamp = DateTime.UtcNow;
            }
            else
            {
                var searchEntry = new SearchHistory
                {
                    Query = query.Trim(),
                    Timestamp = DateTime.UtcNow
                };

                _context.SearchHistory.Add(searchEntry);
            }

            await _context.SaveChangesAsync();

            return Ok();
        }
    }
}