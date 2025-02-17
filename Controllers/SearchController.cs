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
            {
                return BadRequest("Suggestions are available only for queries with more than 2 letters.");
            }
            //Checking Redis cache
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
                .FromSqlInterpolated($"EXEC GetSearchSuggestions @Query = {query}")
                .ToListAsync();

            var result = allSuggestions.Take(10).ToList();

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

            return Ok(); //201 response
        }

        [HttpGet("paginated")]
        public IActionResult GetPaginatedSuggestions(string query, int pageSize = 10, int page = 1)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            Console.WriteLine($"Received query: {query}, pageSize: {pageSize}, page: {page}");

            // Fetch all suggestions
            var allSuggestions = _context.Suggestions
                .FromSqlInterpolated($"EXEC GetSearchResults @Query = {query}")
                .AsEnumerable()
                .Where(s => !s.IsHistory)
                .ToList();

            Console.WriteLine($"Total suggestions fetched from StoredProcedure: {allSuggestions.Count}");

            int totalResults = allSuggestions.Count;
            int totalPages = (int)Math.Ceiling((double)totalResults / pageSize);

            // Apply correct page-based skipping
            var paginatedResults = allSuggestions
                .Skip((page - 1) * pageSize) 
                .Take(pageSize)
                .ToList();

            Console.WriteLine($"Sending page {page}, Results: {paginatedResults.Count}");

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