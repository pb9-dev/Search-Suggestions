let debounceTimeout;
const MAX_QUERY_LENGTH = 15;

document.getElementById('search-bar').addEventListener('input', function () {
    const query = this.value.trim();
    const suggestionsContainer = document.getElementById('suggestions');

    if (!query || query.length > MAX_QUERY_LENGTH) {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';
        return;
    }

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async function () {
        await getSuggestions(query);
    }, 170);
});

document.getElementById('search-bar').addEventListener('keydown', async function (e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        if (query) {
            await logSearch(query); // Log the search query
            window.location.href = `search.html?query=${encodeURIComponent(query)}`;
        }
    }
});

async function getSuggestions(query) {
    const suggestionsContainer = document.getElementById('suggestions');
    suggestionsContainer.innerHTML = '';

    try {
        const response = await axios.get('http://localhost:5165/api/Search', {
            params: { query: query }
        });

        let suggestions = response.data;
        console.log('Suggestions:', suggestions);

        if (suggestions && suggestions.length > 0) {
            suggestionsContainer.style.display = 'block';

            suggestions.forEach((suggestion) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';

                // Choose icon based on history or not
                const icon = document.createElement('i');
                icon.className = suggestion.isHistory
                    ? 'fa fa-globe suggestion-icon' // Globe for history
                    : 'fa fa-search suggestion-icon'; // Search for others

                const text = document.createElement('span');
                text.textContent = suggestion.text;
                text.className = 'suggestion-text';

                div.appendChild(icon);
                div.appendChild(text);

                div.onclick = () => {
                    document.getElementById('search-bar').value = suggestion.text;
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



async function logSearch(query) {
    try {
        await axios.post('http://localhost:5165/api/Search/LogSearch', query, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Optionally, refresh suggestions to include the new history
        await getSuggestions(query);
    } catch (error) {
        console.error('Error logging search:', error);
    }
}
