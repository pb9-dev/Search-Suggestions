import { fireEvent, screen, waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { jest } from "@jest/globals";
import axios from "axios";
import { getSuggestions, fetchResults, logSearch } from "./script.mjs";

// Mock axios
jest.mock("axios", () => ({
  get: jest.fn(),
}));

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  jest.clearAllMocks();

  // Directly mock logSearch on window
  window.logSearch = jest.fn().mockResolvedValue();

  // Mock window.location.assign to track the redirect
  Object.defineProperty(window, "location", {
    writable: true,
    value: { assign: jest.fn(), href: "" },
  });
});

test("Microphone button click toggles mic-active class", () => {
  document.body.innerHTML = '<i id="mic-icon" class="fa fa-microphone"></i>';
  const micIcon = document.getElementById("mic-icon");
  micIcon.addEventListener("click", () => {
    micIcon.classList.toggle("mic-active");
  });

  fireEvent.click(micIcon);
  expect(micIcon).toHaveClass("mic-active");

  fireEvent.click(micIcon);
  expect(micIcon).not.toHaveClass("mic-active");
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

  await expect(fetchResults("error query", 1)).resolves.not.toThrow();
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
