using Microsoft.AspNetCore.Mvc.Testing;

public class CustomWebApplicationFactory<TProgram> : WebApplicationFactory<TProgram> where TProgram : class
{
}
