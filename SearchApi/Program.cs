using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StackExchange.Redis;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using System.Net;
var builder = WebApplication.CreateBuilder(args);

//Sliding Window Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    //  Per IP Sliding Window Rate Limiting
    options.AddPolicy("sliding_window", context =>
    {
        string clientId = NormalizeIp(context.Connection.RemoteIpAddress);

        return RateLimitPartition.GetSlidingWindowLimiter(clientId, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 100,  // Max 100 requests per minute per IP
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6
        });
    });

    // Global Fixed Window Rate Limiting
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter("global_limit", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 1000, // Max 1000 requests per minute for the entire server
            Window = TimeSpan.FromMinutes(1)
        })
    );

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
// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAllOrigins",
        builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

// Add controllers
builder.Services.AddControllers();

// Register Redis connection
builder.Services.AddSingleton<IConnectionMultiplexer>(ConnectionMultiplexer.Connect(
    builder.Configuration.GetConnectionString("Redis") ?? throw new InvalidOperationException("Redis connection string is missing")));

// Add DbContext for SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();
app.UseCors("AllowAllOrigins");

// Apply rate limiting middleware globally
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.Run();
public partial class Program { };