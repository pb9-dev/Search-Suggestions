let debounceTimeout; // Persistent debounce timer
const MAX_QUERY_LENGTH = 15; // Maximum allowed query length

document.getElementById('search-bar').addEventListener('input', function () {
    const query = this.value.trim(); 
    const suggestionsContainer = document.getElementById('suggestions');

    // Clear suggestions if input is empty or exceeds max length
    if (!query || query.length > MAX_QUERY_LENGTH) {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';

        if (query.length > MAX_QUERY_LENGTH) {
            console.warn(`Query exceeds the maximum allowed length of ${MAX_QUERY_LENGTH} characters.`);
        }

        return;
    }

    clearTimeout(debounceTimeout); // Clear the previous timer
    debounceTimeout = setTimeout(async function () {
        await getSuggestions(query);
    }, 170); // 170ms debounce delay
});

document.getElementById('search-bar').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        if (query) {
            window.location.href = `search.html?query=${encodeURIComponent(query)}`;
        }
    }
});

async function getSuggestions(query) {
    const suggestionsContainer = document.getElementById('suggestions');
    suggestionsContainer.innerHTML = ''; // Clear previous suggestions

    try {
        const response = await fetch(
            `http://localhost:5165/api/Search?query=${encodeURIComponent(query)}&userId=guest`
        );
        const suggestions = await response.json();

        if (suggestions && suggestions.length > 0) {
            suggestionsContainer.style.display = 'block'; // Show container when suggestions exist

            const topSuggestions = suggestions
                .slice(0, 6)
                .sort((a, b) => a.length - b.length); // Limit to top 6 and sort by length

            topSuggestions.forEach((suggestion) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';

                const icon = document.createElement('i');
                icon.className = 'fa fa-search suggestion-icon';

                const text = document.createElement('span');
                text.textContent = suggestion;
                text.className = 'suggestion-text';

                div.appendChild(icon);
                div.appendChild(text);

                div.onclick = () => {
                    document.getElementById('search-bar').value = suggestion;
                    suggestionsContainer.innerHTML = '';
                    suggestionsContainer.style.display = 'none';
                };

                suggestionsContainer.appendChild(div);
            });
        } else {
            suggestionsContainer.style.display = 'none'; 
        }
    } catch (error) {
        console.error('Error fetching suggestions:', error);
    }
}
