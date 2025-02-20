import { fireEvent, screen, waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { jest } from "@jest/globals";
import axios from "axios";
import { getSuggestions, fetchResults, logSearch, renderPagination, renderResults } from "./script.mjs";
import { CONFIG } from "./config.mjs"; 
import { setupMicrophone } from "./script.mjs";

import * as scriptModule from "./script.mjs";
// Mock axios
jest.mock("axios", () => ({
  get: jest.fn().mockResolvedValue({
    data: { results: [{ text: "Result 1" }], totalResults: 20 }, 
  }),
  post: jest.fn(),
}));

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  jest.clearAllMocks();
  jest.useFakeTimers();

  // Directly mock logSearch on window
  window.logSearch = jest.fn().mockResolvedValue();

  // Mock window.location.assign to track the redirect
  Object.defineProperty(window, "location", {
    writable: true,
    value: { assign: jest.fn(), href: "" },
  });
});

test("Fetch suggestions and display them", async () => {
  document.body.innerHTML = '<div id="suggestions"></div>';

  axios.get.mockResolvedValue({ data: ["test1", "test2"] });

  await getSuggestions("test");

  expect(screen.getByText("test1")).toBeInTheDocument();
  expect(screen.getByText("test2")).toBeInTheDocument();
});

test("Displays search results when a search is performed", async () => {
  document.body.innerHTML = `
      <input id="search-bar" type="text" />
      <div id="search-results"></div>
  `;

  axios.get.mockResolvedValue({
    data: { results: [{ text: "Result 1" }, { text: "Result 2" }], totalResults: 2 },
  });

  const searchBar = screen.getByRole("textbox");
  fireEvent.input(searchBar, { target: { value: "test query" } });

  await fetchResults("test query", 1);

  expect(screen.getByText("Result 1")).toBeInTheDocument();
  expect(screen.getByText("Result 2")).toBeInTheDocument();
});

test("Stores search results in sessionStorage", async () => {
  document.body.innerHTML = `
      <input id="search-bar" type="text" />
      <div id="search-results"></div>
  `;

  const mockResults = [{ text: "Result 1" }, { text: "Result 2" }];
  axios.get.mockResolvedValue({ data: { results: mockResults, totalResults: 2 } });

  await fetchResults("test query", 1);

  expect(JSON.parse(sessionStorage.getItem("search:test query:page:1"))).toEqual(mockResults);
  expect(sessionStorage.getItem("search:test query:totalResults")).toBe("2");
});

test("Calls API with correct query and pagination params", async () => {
  axios.get.mockResolvedValue({ data: { results: [{ text: "Test Result" }], totalResults: 1 } });

  await fetchResults("search term", 2);

  expect(axios.get).toHaveBeenCalledWith("http://localhost:5165/api/Search/paginated", {
    params: { query: "search term", pageSize: 10, page: 2 },
  });
});

test("Handles API failures gracefully", async () => {
  axios.get.mockRejectedValue(new Error("Network Error"));

  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const result = await fetchResults("error query", 1);

  // Verify the result is a fallback value
  expect(result).toBeNull();

  // Check if the error message was logged for debugging purposes
  expect(consoleSpy).toHaveBeenCalledWith('Error fetching search results:', expect.any(Error));

  // Cleanup spy after test
  consoleSpy.mockRestore();
});

test("Retrieves search results from sessionStorage if available", async () => {
  const mockResults = [{ text: "Cached Result" }];
  sessionStorage.setItem("search:cached:page:1", JSON.stringify(mockResults));
  sessionStorage.setItem("search:cached:totalResults", "1");

  document.body.innerHTML = `<div id="search-results"></div>`;

  await fetchResults("cached", 1);

  expect(screen.getByText("Cached Result")).toBeInTheDocument();
});

test("Pagination buttons render and trigger fetchResults", async () => {
  jest.clearAllMocks();
  document.body.innerHTML = `<div id="pagination"></div>`;

  renderPagination("test", 2, 5); // Start on Page 2 of 5

  axios.get.mockResolvedValue({ data: { results: [{ text: "New Page Result" }], totalResults: 50 } });

  // Click Next (should go to page 3)
  fireEvent.click(screen.getByText("Next"));

  await waitFor(() => {
    console.log("Called fetchResults for:", axios.get.mock.calls);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining(CONFIG.BASE_URL),
      expect.objectContaining({ params: { query: "test", pageSize: 10, page: 3 } })
    );
  });

  // Click Previous (should go back to page 2)
  fireEvent.click(screen.getByText("Previous"));

  await waitFor(() => {
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining(CONFIG.BASE_URL),
      expect.objectContaining({ params: { query: "test", pageSize: 10, page: 2 } })
    );
  });
});


test("Updates results when pagination button is clicked", async () => {
  document.body.innerHTML = `<div id="pagination"></div><div id="search-results"></div>`;

  axios.get.mockResolvedValue({ data: { results: [{ text: "Page 2 Result" }], totalResults: 10 } });

  const button = document.createElement("button");
  button.textContent = "2";
  button.onclick = () => fetchResults("test", 2);
  document.getElementById("pagination").appendChild(button);

  fireEvent.click(screen.getByText("2"));

  await screen.findByText("Page 2 Result");

  expect(screen.getByText("Page 2 Result")).toBeInTheDocument();
});


test("Too long queries do not show suggestions", async () => {
  document.body.innerHTML = `<input id="search-bar" type="text" />
                             <div id="suggestions" style="display: block;"></div>`;

  const searchBar = document.getElementById("search-bar");
  const suggestionsContainer = document.getElementById("suggestions");

  // Manually trigger DOMContentLoaded to attach event listeners
  document.dispatchEvent(new Event("DOMContentLoaded"));

  // Spy on console.error
  const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  // Set input value
  searchBar.value = "a".repeat(21);

  // Dispatch actual input event (ensuring listener fires)
  searchBar.dispatchEvent(new Event("input", { bubbles: true }));

  // Wait for the function to execute
  await waitFor(() => {
    expect(suggestionsContainer.innerHTML).toBe("");
    expect(window.getComputedStyle(suggestionsContainer).display).toBe("none");
    expect(consoleSpy).toHaveBeenCalledWith("Empty Query or Query length more than 20 is not allowed");
  });

  consoleSpy.mockRestore(); // Clean up spy
});


// New test cases

test("Handles empty search results gracefully", async () => {
  axios.get.mockResolvedValue({ data: { results: [], totalResults: 0 } });
  document.body.innerHTML = '<div id="search-results"></div>';

  await fetchResults("noresults", 1);

  expect(screen.queryByText("Result 1")).not.toBeInTheDocument();
  expect(screen.queryByText("Result 2")).not.toBeInTheDocument();
});

test("Handles API failure when fetching search results", async () => {
  axios.get.mockRejectedValue(new Error("Network error"));
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  await fetchResults("error", 1);

  expect(consoleSpy).toHaveBeenCalledWith("Error fetching search results:", expect.any(Error));
  consoleSpy.mockRestore();
});

test("Handles API failure when fetching suggestions", async () => {
  axios.get.mockRejectedValue(new Error("Suggestion error"));
  await expect(getSuggestions("test")).rejects.toThrow("Suggestion error");
});
test("Debounces getSuggestions API call correctly", async () => {
  jest.useFakeTimers(); // Enable fake timers

  document.body.innerHTML = `<input id="search-bar" /><div id="suggestions"></div>`;

  // 🔹 Manually trigger DOMContentLoaded so the input event listener attaches
  document.dispatchEvent(new Event("DOMContentLoaded"));

  const searchBar = document.getElementById("search-bar");
  axios.get.mockResolvedValueOnce({ data: ["test1", "test2"] });

  // 🔹 Fire multiple rapid input events
  fireEvent.input(searchBar, { target: { value: "h" } });
  fireEvent.input(searchBar, { target: { value: "he" } });
  fireEvent.input(searchBar, { target: { value: "hel" } });

  // Advance timers and wait for debounce to trigger
  jest.advanceTimersByTime(300);

  await waitFor(() => {
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  expect(axios.get).toHaveBeenCalledWith(`${CONFIG.BASE_URL}`, {
    params: { query: "hel" },
  });

  jest.useRealTimers(); // Restore real timers
});


test("Loads query from URL on page load", async () => {
  delete window.location;
  window.location = { search: "?query=test" };

  document.body.innerHTML = '<input id="search-bar" />';

  // Use dynamic import to reload the module
  await import("./script.mjs");

  document.dispatchEvent(new Event("DOMContentLoaded"));

  expect(screen.getByRole("textbox")).toHaveValue("test");
});

test("Fetches search results from API", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <div id="search-results"></div>
  `;

  axios.get.mockResolvedValueOnce({ data: { results: [{ text: "Result" }], totalResults: 1 } });

  await fetchResults("test", 1);

  expect(screen.getByText("Result")).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining(CONFIG.BASE_URL), expect.any(Object));
});

beforeEach(() => {
  window.SpeechRecognition = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    onresult: jest.fn(),
    onerror: jest.fn(),
    onend: jest.fn(),
  }));
});

test("Toggles microphone on click", async () => {
  document.body.innerHTML = '<i id="mic-icon" class="fa fa-microphone"></i>';
  const micIcon = document.getElementById("mic-icon");

  setupMicrophone(); // Ensure event listener is attached

  fireEvent.click(micIcon);
  expect(micIcon).toHaveClass("mic-active");

  fireEvent.click(micIcon);
  expect(micIcon).not.toHaveClass("mic-active");
});

test("Handles API failure when logging search", async () => {
  axios.post.mockRejectedValue(new Error("Network error"));
  const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  await logSearch("test");

  expect(consoleSpy).toHaveBeenCalledWith("Error logging search:", expect.any(Error));

  consoleSpy.mockRestore();
});
test("Generates correct pagination buttons", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;
  const paginationContainer = document.getElementById("pagination");

  const query = "test";
  const currentPage = 2;
  const totalPages = 5;

  renderPagination(query, currentPage, totalPages);

  expect(paginationContainer.children.length).toBe(7); // Previous + 5 pages + Next
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("2")).toHaveClass("active");
  expect(screen.getByText("5")).toBeInTheDocument();
});

test("Pagination buttons trigger correct fetch calls", async () => {
  document.body.innerHTML = `<div id="pagination"></div><div id="search-results"></div>`;

  axios.get.mockResolvedValue({ data: { results: [{ text: "Page 2 Result" }], totalResults: 10 } });

  renderPagination("test", 1, 3);

  fireEvent.click(screen.getByText("2"));
  // console.log(CONFIG.BASE_URL, "is base url");

  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining(CONFIG.BASE_URL),
    expect.objectContaining({ params: { query: "test", pageSize: 10, page: 2 } })
  ));

  expect(screen.getByText("Page 2 Result")).toBeInTheDocument();
});

test("Pagination is not rendered if only one page exists", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;
  renderPagination("test", 1, 1);

  expect(document.getElementById("pagination").innerHTML).toBe(""); // Should be empty
});

test("Disables Previous on first page and Next on last page", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;

  // Render on page 1 (should disable Previous)
  renderPagination("test", 1, 5);
  expect(screen.getByText("Previous")).toBeDisabled();
  expect(screen.getByText("Next")).not.toBeDisabled();

  // Render on last page (should disable Next)
  document.body.innerHTML = `<div id="pagination"></div>`;
  renderPagination("test", 5, 5);
  expect(screen.getByText("Next")).toBeDisabled();
  expect(screen.getByText("Previous")).not.toBeDisabled();
});

test("Pagination renders all necessary buttons", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;

  renderPagination("test", 3, 5); // Page 3 of 5

  expect(screen.getByText("Previous")).toBeInTheDocument();
  expect(screen.getByText("Next")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
});

test("Both Previous and Next buttons are enabled on middle pages", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;

  renderPagination("test", 3, 5); // Page 3 of 5

  expect(screen.getByText("Previous")).not.toBeDisabled();
  expect(screen.getByText("Next")).not.toBeDisabled();
});

test("Clicking a suggestion updates search bar and hides suggestions", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <div id="suggestions"></div> <!-- Start empty, let getSuggestions populate it -->
  `;

  const searchBar = document.getElementById("search-bar");
  const suggestionsContainer = document.getElementById("suggestions");


  axios.get.mockResolvedValue({
    data: [{ text: "Suggested Item" }],
  });
  await getSuggestions("test");

  await waitFor(() => {
    expect(suggestionsContainer.innerHTML).not.toBe(""); // Ensure it's populated
  });

  const suggestionItem = document.querySelector(".suggestion-item");
  expect(suggestionItem).toBeInTheDocument(); // Ensure the suggestion is created

  // 🔹 Simulate clicking the suggestion
  fireEvent.click(suggestionItem);

  // 🔹 Wait for updates
  await waitFor(() => {
    expect(searchBar.value).toBe("Suggested Item"); // 
    expect(suggestionsContainer.innerHTML).toBe(""); //
    expect(window.getComputedStyle(suggestionsContainer).display).toBe("none"); // 
  });
});

test("Hides suggestions container when no suggestions are returned", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <div id="suggestions" style="display: block;">Existing Content</div> 
  `;

  const suggestionsContainer = document.getElementById("suggestions");

  // 🔹 Mock API response to return an empty array (triggers the else block)
  axios.get.mockResolvedValue({ data: [] });

  // 🔹 Call getSuggestions with a query
  await getSuggestions("test");

  // 🔹 Wait for UI updates
  await waitFor(() => {
    expect(suggestionsContainer.innerHTML).toBe(""); // ✅ Suggestions should be cleared
    expect(window.getComputedStyle(suggestionsContainer).display).toBe("none"); // ✅ Container should be hidden
  });
});

test("Uses correct icon for history suggestions", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <div id="suggestions"></div> 
  `;

  axios.get.mockResolvedValue({ data: [{ text: "History Item", isHistory: true }] });

  await getSuggestions("history");

  await waitFor(() => {
    expect(document.querySelector(".fa-globe")).toBeInTheDocument();
  });
});

test("Uses correct icon for normal suggestions", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <div id="suggestions"></div> 
  `;

  axios.get.mockResolvedValue({ data: [{ text: "Search Item", isHistory: false }] });

  await getSuggestions("search");

  await waitFor(() => {
    expect(document.querySelector(".fa-search")).toBeInTheDocument();
  });
});

test("Hides microphone icon when speech recognition is not supported", () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <i id="mic-icon" style="display: block;"></i>
  `;

  // 🔹 Remove SpeechRecognition from window object
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;

  setupMicrophone(); // Call function

  const micIcon = document.getElementById("mic-icon");
  expect(micIcon.style.display).toBe("none"); // ✅ Mic should be hidden
});

test("Does not hide microphone icon when speech recognition is supported", () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <i id="mic-icon" style="display: block;"></i>
  `;

  // 🔹 Mock SpeechRecognition support
  window.SpeechRecognition = jest.fn();

  setupMicrophone(); // Call function

  const micIcon = document.getElementById("mic-icon");
  expect(micIcon.style.display).not.toBe("none"); // ✅ Mic should remain visible
});

test("Clicking mic icon toggles active state", () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <i id="mic-icon"></i>
  `;

  // 🔹 Mock SpeechRecognition
  window.SpeechRecognition = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn()
  }));

  const recognition = setupMicrophone(); // Call function
  const micIcon = document.getElementById("mic-icon");

  // 🔹 Simulate first click (activate mic)
  micIcon.click();
  expect(micIcon.classList.contains("mic-active")).toBe(true);

  // 🔹 Simulate second click (deactivate mic)
  micIcon.click();
  expect(micIcon.classList.contains("mic-active")).toBe(false);
});

jest.useFakeTimers(); // Use Jest's fake timers for setTimeout control

test("Updates search bar and redirects on speech recognition result", async () => {
  document.body.innerHTML = `
    <input id="search-bar" type="text" />
    <i id="mic-icon"></i>
  `;

  // 🔹 Mock SpeechRecognition and its methods
  const mockStart = jest.fn();
  const mockStop = jest.fn();
  const mockRecognition = {
    start: mockStart,
    stop: mockStop,
    onresult: null,
    onerror: null,
    onend: null,
  };
  
  window.SpeechRecognition = jest.fn(() => mockRecognition);

  setupMicrophone(); // Call function to initialize mic

  // 🔹 Simulate speech recognition result event
  const searchBar = document.getElementById("search-bar");
  const mockEvent = {
    results: [[{ transcript: "Hello World" }]], // Simulated speech result
  };

  // Trigger the event
  mockRecognition.onresult(mockEvent);

  // 🔹 Ensure search bar is updated
  expect(searchBar.value).toBe("Hello World");

  // 🔹 Fast-forward time to check if redirection occurs after 1500ms
  jest.advanceTimersByTime(1500);
  expect(window.location.href).toBe("search.html?query=Hello%20World");

  jest.useRealTimers(); // Restore real timers
});

test("Renders search results correctly", () => {
  document.body.innerHTML = `<div id="search-results"></div>`;

  const results = [
    { text: "Result 1" },
    { text: "Result 2" },
  ];

  renderResults(results);

  const resultsContainer = document.getElementById("search-results");
  expect(resultsContainer.children.length).toBe(2);
  expect(resultsContainer.innerHTML).toContain("Result 1");
  expect(resultsContainer.innerHTML).toContain("Result 2");
});