using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using SearchApi.Controllers;
using StackExchange.Redis;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using System.Collections.Generic;
using SearchApi.Models;
//using Microsoft.OpenApi.Services;

public class SearchControllerTests
{
    private readonly SearchController _controller;
    private readonly AppDbContext _context;
    private readonly Mock<IConnectionMultiplexer> _mockRedis;
    private readonly Mock<IDatabase> _mockRedisDatabase;
    private readonly DbContextOptions<AppDbContext> _dbOptions;
    private object _mockConnection;

    public SearchControllerTests()
    {
        _dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: "TestDb")
            .Options;

        _context = new AppDbContext(_dbOptions);
        _mockRedis = new Mock<IConnectionMultiplexer>();
        _mockRedisDatabase = new Mock<IDatabase>();

        _mockRedis.Setup(r => r.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
                  .Returns(_mockRedisDatabase.Object);

        _controller = new SearchController(_context, _mockRedis.Object);
    }

    [Fact]
    public async Task GetSuggestions_ReturnsBadRequest_WhenQueryIsEmpty()
    {
        var result = await _controller.GetSuggestions("");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task GetSuggestions_ReturnsBadRequest_WhenQueryTooShort()
    {
        var result = await _controller.GetSuggestions("ab");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task GetSuggestions_ReturnsCachedData_WhenAvailable()
    {
        // Arrange 
        string query = "laptop";
        string cachedData = "Laptop|Laptop Stand|Laptop Charger";

        _mockRedisDatabase.Setup(r => r.StringGetAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
                          .ReturnsAsync(cachedData);

        var result = await _controller.GetSuggestions(query) as OkObjectResult;
        Assert.NotNull(result);

        var suggestions = result.Value as IEnumerable<object>;
        Assert.NotNull(suggestions);
        Assert.Equal(3, suggestions.Count());
    }

    [Fact]
    public async Task LogSearch_ReturnsBadRequest_WhenQueryIsEmpty()
    {
        var result = await _controller.LogSearch("");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task LogSearch_AddsNewEntry_WhenQueryDoesNotExist()
    {
        using (var context = new AppDbContext(_dbOptions))
        {
            var controller = new SearchController(context, _mockRedis.Object);
            var result = await controller.LogSearch("new search");

            var searchEntry = context.SearchHistory.FirstOrDefault(s => s.Query == "new search");

            Assert.IsType<OkResult>(result);
            Assert.NotNull(searchEntry);
        }
    }

    [Fact]
    public async Task GetPaginatedSuggestions_ReturnsBadRequest_WhenQueryIsEmpty()
    {
        // Act
        var result = await _controller.GetPaginatedSuggestions("");
        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Query cannot be empty.", (result as BadRequestObjectResult)?.Value);
    }

    [Fact]
    public async Task GetPaginatedSuggestions_ReturnsBadRequest_WhenPageIsInvalid()
    {
        // Act
        var result = await _controller.GetPaginatedSuggestions("test", 10, 0);
        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Page number must be greater than zero.", (result as BadRequestObjectResult)?.Value);
    }
  
}
    public class RateLimitingTests : IClassFixture<WebApplicationFactory<Program>>
    {
        private readonly HttpClient _client;

        public RateLimitingTests(WebApplicationFactory<Program> factory)
        {
            _client = factory.CreateClient();
        }

        [Fact]
        public async Task GetSuggestions_ShouldReturnTooManyRequests_AfterRateLimitExceeded()
        {
            string testQuery = "testquery";
            int maxRequests = 100; // Defined in sliding window

            for (int i = 0; i < maxRequests; i++)
            {
                var response = await _client.GetAsync($"/api/search?query={testQuery}");
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                await Task.Delay(50); // Add small delay
            }
            var rateLimitedResponse = await _client.GetAsync($"/api/search?query={testQuery}");
            Assert.Equal(HttpStatusCode.TooManyRequests, rateLimitedResponse.StatusCode);
            Assert.True(rateLimitedResponse.Headers.Contains("Retry-After"));
        }
    }
