using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using SearchApi.Models;
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

            // Check Redis cache
            var cacheKey = $"suggestions:{query.ToLower()}";
            var cachedSuggestions = await _redisCache.StringGetAsync(cacheKey);
            if (!cachedSuggestions.IsNullOrEmpty)
            {
                Console.WriteLine($"Data fetched from Redis cache for query: {query}");
                var cachedResults = cachedSuggestions.ToString().Split('|');
                return Ok(cachedResults.Select(result => new { Text = result, IsHistory = false }));
            }

            Console.WriteLine($"Cache miss for query: {query}. Fetching data from the database.");

            var historySuggestions = _context.SearchHistory
                .Where(sh => EF.Functions.Like(sh.Query, $"{query}%"))
                .Select(sh => new { Text = sh.Query, IsHistory = true });

            var indexSuggestions = _context.SearchIndex
                .Where(si => EF.Functions.Like(si.Title, $"{query}%") || EF.Functions.Like(si.Keywords, $"{query}%"))
                .Select(si => new { Text = si.Title + ", " + si.Keywords, IsHistory = false });

            // Combine suggestions, sort by length, and return
            var allSuggestions = historySuggestions
                .Union(indexSuggestions)
                .AsEnumerable()
                .SelectMany(s => s.Text.Split(',').Select(w => new { Text = w.Trim(), IsHistory = s.IsHistory }))
                .Where(word => word.Text.StartsWith(query, StringComparison.OrdinalIgnoreCase))
                .Distinct()
                .OrderBy(word => word.Text.Length)  // Order by text length
                .Take(10);

            var result = allSuggestions.ToList();

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
