using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

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
                return Ok(cachedSuggestions.ToString().Split('|'));
            }
            Console.WriteLine($"Cache miss for query: {query}. Fetching data from the database.");
            var historySuggestions = _context.SearchHistory
                .Where(sh => EF.Functions.Like(sh.Query, $"{query}%"))
                .Select(sh => sh.Query);

            var indexSuggestions = _context.SearchIndex
                .Where(si => EF.Functions.Like(si.Title, $"{query}%") || EF.Functions.Like(si.Keywords, $"{query}%"))
                .Select(si => si.Title + ", " + si.Keywords);

    
            var allSuggestions = historySuggestions
                .Union(indexSuggestions)
                .AsEnumerable() 
                .SelectMany(s => s.Split(',').Select(w => w.Trim())) 
                .Where(word => word.StartsWith(query, StringComparison.OrdinalIgnoreCase)) 
                .Distinct()
                .Take(10);

            var result = allSuggestions.ToList();

            await _redisCache.StringSetAsync(cacheKey, string.Join("|", result), TimeSpan.FromMinutes(5));

            return Ok(result);
        }
    }
}
