
namespace SearchApi.Models
{
    public class SearchResult
    {
        public int Id { get; set; }
        public string Title { get; set; }
        public string Keywords { get; set; }
    }

    public class PaginatedSearchResponse
    {
        public int TotalRecords { get; set; }
        public List<SearchResult> Results { get; set; }
    }
}
