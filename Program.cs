using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StackExchange.Redis;
using SearchApi.Controllers;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using System.Net;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAllOrigins", policy =>
    {
        policy.AllowAnyOrigin() // Allow requests from any origin
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});
//configure rateLimit
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("sliding_window", context =>
    {
        string clientIp = NormalizeIp(context.Connection.RemoteIpAddress);

        return RateLimitPartition.GetSlidingWindowLimiter(clientIp, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 100,  // Max 100 requests per minute
            Window = TimeSpan.FromMinutes(1),  // Full window length (1 min)
            SegmentsPerWindow = 6  // Divides into 10-second segments
        });
    });

    options.RejectionStatusCode = 429;
    options.OnRejected = async (context, _) =>
    {
        int retryAfterSeconds = GetRetryAfterSeconds(context.Lease);
        context.HttpContext.Response.Headers["Retry-After"] = retryAfterSeconds.ToString();
        await context.HttpContext.Response.WriteAsync($"Rate limit exceeded. Try again after {retryAfterSeconds} seconds.");
    };
});

// Normalize IPv6-mapped IPv4 addresses
static string NormalizeIp(IPAddress? ipAddress)
{
    if (ipAddress == null)
        return "unknown";

    return ipAddress.IsIPv4MappedToIPv6 || ipAddress.ToString() == "::1"
        ? "127.0.0.1"
        : ipAddress.ToString();
}

// Get retry time dynamically
static int GetRetryAfterSeconds(RateLimitLease? lease)
{
    if (lease != null && lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
    {
        return (int)retryAfter.TotalSeconds;
    }

    return 10;  // Default wait time
}

// Add services to the container.redis-server

builder.Services.AddControllers();

// Register the Redis connection as a singleton
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis"))
);
// Add DbContext for SQL Server (assuming you have already configured it in appsettings.json)
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
// Add any other services (e.g., for caching, logging, etc.)
builder.Services.AddMemoryCache(); // Optional, if you need to use MemoryCache for fallback caching
var app = builder.Build();
app.UseCors("AllowAllOrigins");
// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}


app.UseHttpsRedirection();
app.UseAuthorization();
app.UseRateLimiter();
// Map controllers
app.MapControllers();
// Run the app
app.Run();
public partial class Program { } // Add this to enable WebApplicationFactory

