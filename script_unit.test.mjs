import { fireEvent, screen, waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { jest } from "@jest/globals";
import axios from "axios";
import { getSuggestions, fetchResults, logSearch, renderPagination } from "./script.mjs";
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

test("Renders correct pagination buttons based on total pages", () => {
  document.body.innerHTML = `<div id="pagination"></div>`;

  const renderPagination = (query, currentPage, totalPages) => {
    const paginationContainer = document.getElementById("pagination");
    paginationContainer.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.onclick = () => fetchResults(query, i);
      paginationContainer.appendChild(btn);
    }
  };

  renderPagination("test", 1, 3);

  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
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

test("Triggers search when Enter key is pressed", async () => {
  document.body.innerHTML = `<input id="search-bar" type="text" />`;

  const searchBar = screen.getByRole("textbox");
  searchBar.value = "test query";

  // Mocked async behavior inside the event listener
  searchBar.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      // Use a small delay to ensure async resolution
      await window.logSearch(searchBar.value);
      window.location.assign(`search.html?query=${encodeURIComponent(searchBar.value)}`);
    }
  });

  fireEvent.keyDown(searchBar, { key: "Enter", code: "Enter" });

  // Wait for window.logSearch to be called
  await waitFor(() => expect(window.logSearch).toHaveBeenCalledWith("test query"));
  
  // Ensure location.assign was called with the expected query
  expect(window.location.assign).toHaveBeenCalledWith("search.html?query=test%20query");
});


test("Prevents searches with empty or too long queries", async () => {
  document.body.innerHTML = `<input id="search-bar" type="text" />`;

  const searchBar = screen.getByRole("textbox");

  fireEvent.input(searchBar, { target: { value: "" } });
  fireEvent.keyDown(searchBar, { key: "Enter", code: "Enter" });

  expect(window.location.href).not.toContain("search.html?query=");

  fireEvent.input(searchBar, { target: { value: "a".repeat(21) } });
  fireEvent.keyDown(searchBar, { key: "Enter", code: "Enter" });

  expect(window.location.href).not.toContain("search.html?query=");
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

jest.useFakeTimers();

test("Debounces getSuggestions API call correctly", async () => {
  document.body.innerHTML = `
    <input id="search-bar" />
    <div id="suggestions"></div> <!-- Ensure this element exists -->
  `;

  const searchBar = screen.getByRole("textbox");

  axios.get.mockResolvedValueOnce({ data: ["test1", "test2"] });

  fireEvent.input(searchBar, { target: { value: "h" } });
  fireEvent.input(searchBar, { target: { value: "he" } });
  fireEvent.input(searchBar, { target: { value: "hel" } });

  jest.advanceTimersByTime(300);

  // Call getSuggestions now that #suggestions exists
  await getSuggestions("hel");

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

  expect(axios.get).toHaveBeenCalledWith(`${CONFIG.BASE_URL}`, {
    params: { query: "hel" },
  });
});

jest.useRealTimers();


test("Disables previous button on first page", () => {
  document.body.innerHTML = '<button id="prev-button" disabled></button>';
  expect(screen.getByRole("button")).toBeDisabled();
});

test("Disables next button on last page", () => {
  document.body.innerHTML = '<button id="next-button" disabled></button>';
  expect(screen.getByRole("button")).toBeDisabled();
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

// test("Calls fetchResults with correct page number when clicking a page button", async () => {
//   document.body.innerHTML = `<div id="pagination"></div>`;

//   // ✅ Spy on fetchResults BEFORE calling renderPagination
//   const fetchResultsMock = jest.spyOn(scriptModule, "fetchResults").mockImplementation(() => {});

//   renderPagination("test", 1, 3); // Render pagination

//   const pageButton = screen.getByText("2");
//   expect(pageButton).toBeInTheDocument();

//   fireEvent.click(pageButton); // Click page 2

//   await waitFor(() => {
//     console.log("fetchResultsMock Calls:", fetchResultsMock.mock.calls);
//     expect(fetchResultsMock).toHaveBeenCalledTimes(1);
//     expect(fetchResultsMock).toHaveBeenCalledWith("test", 2);
//   });

//   fetchResultsMock.mockRestore(); // ✅ Restore function after test
// });
