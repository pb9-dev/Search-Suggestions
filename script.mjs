//checking pipeline 1
import axios from 'axios';
import { CONFIG } from './config.mjs';
const pageSize = 10;
let debounceTimeout;
const MAX_QUERY_LENGTH = 20;

document.addEventListener("DOMContentLoaded", function () {
    const queryParams = new URLSearchParams(window.location.search);
    const query = queryParams.get("query");
    const searchBar = document.getElementById("search-bar");

    if (query && searchBar) {
        searchBar.value = query;
        fetchResults(query, 1);
    }
});

const CACHE_TTL_MS = 1 * 60 * 1000; 

export async function fetchResults(query, page) {
    try {
        const cacheKey = `search:${query}:page:${page}`;
        const storedData = sessionStorage.getItem(cacheKey);
        const storedTotalResults = sessionStorage.getItem(`search:${query}:totalResults`);

        if (storedData && storedTotalResults) {
            console.log("Fetching from sessionStorage.");
            renderResults(JSON.parse(storedData));
            renderPagination(query, page, Math.ceil(storedTotalResults / pageSize));
            return;
        }

        console.log("Fetching from API...");
        const response = await axios.get(`${CONFIG.BASE_URL}/paginated`, {
            params: { query: query, pageSize: pageSize, page: page }
        });

        const { results, totalResults } = response.data;
        const totalPages = Math.ceil(totalResults / pageSize);

        sessionStorage.setItem(cacheKey, JSON.stringify(results));
        sessionStorage.setItem(`search:${query}:totalResults`, totalResults);

        renderResults(results);
        renderPagination(query, page, totalPages);
    } catch (error) {
        console.error('Error fetching search results:', error);
        return null;
    }
}


function renderPagination(query, currentPage, totalPages) {  
    const paginationContainer = document.getElementById("pagination");
    if (!paginationContainer) return;
    // console.log("Pagination Container Inner HTML:", paginationContainer.innerHTML);
    paginationContainer.innerHTML = "";

    if (totalPages <= 1) return;

    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    const prevButton = document.createElement("button");
    prevButton.textContent = "Previous";
    // Disable it if on the first page
    if (currentPage === 1) {
        prevButton.disabled = true;
    }
    prevButton.onclick = () => fetchResults(query, currentPage - 1);
    paginationContainer.appendChild(prevButton);

    //generate button dynamically
    for (let i = startPage; i <= endPage; i++) {
        const pageLink = document.createElement("button");
        pageLink.textContent = i;
        pageLink.className = i === currentPage ? "active" : "";
        pageLink.onclick = () => fetchResults(query, i);
        paginationContainer.appendChild(pageLink);
    }

    const nextButton = document.createElement("button");
    nextButton.textContent = "Next";
    // Disable it if on the last page
    if (currentPage === totalPages) {
        nextButton.disabled = true;
    }
    nextButton.onclick = () => fetchResults(query, currentPage + 1);
    paginationContainer.appendChild(nextButton); 
}

function renderResults(results) {
    const resultsContainer = document.getElementById("search-results");
    if (!resultsContainer) return;

    resultsContainer.innerHTML = "";
    results.forEach((result) => {
        const div = document.createElement("div");
        div.className = "search-result";
        div.innerHTML = `<h2><a href="#">${result.text}</a></h2>`;
        resultsContainer.appendChild(div);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const searchBar = document.getElementById("search-bar");
    const suggestionsContainer = document.getElementById("suggestions");
    
    if (searchBar) {
        searchBar.addEventListener("input", function () {
            if (!suggestionsContainer) return;
            const query = this.value.trim();
            if (!query || query.length > MAX_QUERY_LENGTH) {
                suggestionsContainer.innerHTML = "";
                suggestionsContainer.style.display = "none";
                console.error("Empty Query or Query length more than 20 is not allowed");
                return;
            }

            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(async function () {
                await getSuggestions(query);
            }, 300);
        });

        searchBar.addEventListener("keydown", async function (e) {
            if (e.key === "Enter") {
                const query = this.value.trim();
                if (query) {
                    await logSearch(query);
                    window.location.href = `search.html?query=${encodeURIComponent(query)}`;
                }
            }
        });
    }
});

export async function getSuggestions(query) {
    const suggestionsContainer = document.getElementById("suggestions");


    try {
        
        const response = await axios.get(`${CONFIG.BASE_URL}`, {
            params: { query: query }
        });
        suggestionsContainer.innerHTML = '';
        const suggestions = response.data;

        if (suggestions && suggestions.length > 0) {
            suggestionsContainer.style.display = "block";
            suggestions.forEach((suggestion) => {
                const div = document.createElement("div");
                div.className = "suggestion-item";

                const icon = document.createElement("i");
                icon.className = suggestion.isHistory ? "fa fa-globe suggestion-icon" : "fa fa-search suggestion-icon";

                const text = document.createElement("span");
                text.textContent = suggestion.text || suggestion;
                text.className = "suggestion-text";

                div.appendChild(icon);
                div.appendChild(text);

                div.onclick = () => {
                    const searchBar = document.getElementById("search-bar");
                    if (searchBar) {
                        searchBar.value = suggestion.text || suggestion;
                    }
                    suggestionsContainer.innerHTML = "";
                    suggestionsContainer.style.display = "none";
                };

                suggestionsContainer.appendChild(div);
            });
        } else {
            suggestionsContainer.style.display = "none";
        }
    } catch (error) {
        throw error;
    }
}



export async function logSearch(query) {
    try {
        await axios.post(`${CONFIG.BASE_URL}/LogSearch`, query, {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("Error logging search:", error);
    }
}

export function setupMicrophone() {
    const searchBar = document.getElementById("search-bar");
    const micIcon = document.getElementById("mic-icon");

    if (!micIcon) return;

    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
        micIcon.style.display = "none";
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.lang = "en-US";
    recognition.interimResults = false;

    micIcon.addEventListener("click", () => {
        if (!micIcon.classList.contains("mic-active")) {
            micIcon.classList.add("mic-active");
            recognition.start();
        } else {
            micIcon.classList.remove("mic-active");
            recognition.stop();
        }
    });

    recognition.onresult = (event) => {
        if (searchBar) {
            searchBar.value = event.results[0][0].transcript;
            setTimeout(() => {
                window.location.href = `search.html?query=${encodeURIComponent(searchBar.value)}`;
            }, 1500);
        }
    };

    recognition.onerror = () => micIcon.classList.remove("mic-active");
    recognition.onend = () => micIcon.classList.remove("mic-active");

    return recognition; 
}
document.addEventListener("DOMContentLoaded", () => {
    setupMicrophone(); 
});