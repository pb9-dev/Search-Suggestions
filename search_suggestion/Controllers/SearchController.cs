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
                .FromSqlInterpolated($"EXEC GetSearchSuggestions @Query = {query}")
               // .FromSqlInterpolated($"EXEC SearchSuggestions @Query = {query}") /*contains*/
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
        /***actual code*
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
        } **/
        [HttpGet("paginated")]
        [EnableRateLimiting("sliding_window")]
        public async Task<IActionResult> GetPaginatedSuggestions(string query, int pageSize = 10, int page = 1)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Query cannot be empty.");

            if (page <= 0)
                return BadRequest("Page number must be greater than zero.");

            try
            {
                var totalRecords = 0;
                var paginatedResults = new List<SearchResult>();

                using (var connection = _context.Database.GetDbConnection())
                {
                    await connection.OpenAsync();
                    using (var command = connection.CreateCommand())
                    {
                        command.CommandText = "GetPaginatedSearchResults";
                        command.CommandType = System.Data.CommandType.StoredProcedure;

                        var queryParam = command.CreateParameter();
                        queryParam.ParameterName = "@Query";
                        queryParam.Value = query;
                        command.Parameters.Add(queryParam);

                        var pageSizeParam = command.CreateParameter();
                        pageSizeParam.ParameterName = "@PageSize";
                        pageSizeParam.Value = pageSize;
                        command.Parameters.Add(pageSizeParam);

                        var offsetParam = command.CreateParameter();
                        offsetParam.ParameterName = "@Offset";
                        offsetParam.Value = (page - 1) * pageSize;
                        command.Parameters.Add(offsetParam);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                totalRecords = reader.GetInt32(0);
                            }
                            if (await reader.NextResultAsync())
                            {
                                while (await reader.ReadAsync())
                                {
                                    paginatedResults.Add(new SearchResult
                                    {
                                        Id = reader.GetInt32(0),
                                        Title = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                                        Keywords = reader.IsDBNull(2) ? string.Empty : reader.GetString(2)
                                    });
                                }
                            }
                        }
                    }
                }

                int totalPages = (int)Math.Ceiling((double)totalRecords / pageSize);

                return Ok(new
                {
                    results = paginatedResults,
                    totalRecords = totalRecords,
                    pageSize = pageSize,
                    currentPage = page,
                    totalPages = totalPages
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

}
}

