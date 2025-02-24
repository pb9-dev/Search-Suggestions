
using System.ComponentModel.DataAnnotations;

namespace SearchApi.Models
{
    public class Suggestion
    {
       
        public string Text { get; set; }
        public bool IsHistory { get; set; }
    }
}