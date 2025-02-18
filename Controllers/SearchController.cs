using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using SearchApi.Models;
using Microsoft.AspNetCore.RateLimiting;


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
        [EnableRateLimiting("sliding_window")]
        public async Task<IActionResult> GetSuggestions(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            if (query.Trim().Length <= 2)
                return BadRequest("Suggestions are available only for queries with more than 2 letters.");

            var cacheKey = $"suggestions:{query.ToLower()}";
            var cachedSuggestions = await _redisCache.StringGetAsync(cacheKey);
            if (!cachedSuggestions.IsNullOrEmpty)
            {
                var cachedResults = cachedSuggestions.ToString().Split('|');
                return Ok(cachedResults.Select(result => new { Text = result, IsHistory = false }));
            }

            var allSuggestions = await _context.Suggestions
                //.FromSqlInterpolated($"EXEC GetSearchSuggestions @Query = {query}")
                .FromSqlInterpolated($"EXEC SearchSuggestions @Query = {query}")
                .ToListAsync();

            var result = allSuggestions.Take(10).ToList();
            await _redisCache.StringSetAsync(cacheKey, string.Join("|", result.Select(r => r.Text)), TimeSpan.FromMinutes(5));

            return Ok(result);
        }

        [HttpPost("LogSearch")]
        [EnableRateLimiting("sliding_window")]
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

        // Apply Token Bucket Rate Limiting (20 tokens, 5 added per 10 sec)
        [HttpGet("paginated")]
        [EnableRateLimiting("sliding_window")]
        public IActionResult GetPaginatedSuggestions(string query, int pageSize = 10, int page = 1)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            if (page <= 0) // Check for invalid page number (e.g., negative or zero)
                return BadRequest("Page number must be greater than zero.");

            var allSuggestions = _context.Suggestions
                .FromSqlInterpolated($"EXEC GetSearchResults @Query = {query}")
                .AsEnumerable()
                .Where(s => !s.IsHistory)
                .ToList();

            int totalResults = allSuggestions.Count;
            int totalPages = (int)Math.Ceiling((double)totalResults / pageSize);

            var paginatedResults = allSuggestions
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return Ok(new
            {
                results = paginatedResults,
                totalResults = totalResults,
                pageSize = pageSize,
                currentPage = page,
                totalPages = totalPages
            });
        }
    }
}

