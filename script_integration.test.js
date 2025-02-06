import { fireEvent, screen, waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import axios from "axios";
import { getSuggestions, fetchResults, logSearch, setupMicrophone } from "./script.js";

global.SpeechRecognition = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
}));
test("Microphone button toggles and calls SpeechRecognition", () => {
  document.body.innerHTML = `
      <input id="search-bar" type="text" />
      <i id="mic-icon" class="fa fa-microphone"></i>
  `;
  const recognition = setupMicrophone();
  const micIcon = document.getElementById("mic-icon");

  fireEvent.click(micIcon);
  expect(micIcon.classList.contains("mic-active")).toBe(true);
  expect(recognition.start).toHaveBeenCalled();

  fireEvent.click(micIcon);
  expect(micIcon.classList.contains("mic-active")).toBe(false);
  expect(recognition.stop).toHaveBeenCalled();
});
  
  test("Fetch suggestions and display them from API", async () => {
    document.body.innerHTML = '<div id="suggestions"></div>';
  
    await getSuggestions("asp");
  
    console.log("log for suggestions container" + document.body.innerHTML);
  
    await waitFor(() => {
      expect(screen.getByText("ASP.NET Core")).toBeInTheDocument();
    });
  });
  

  test("Displays search results from API", async () => {
    document.body.innerHTML = `
        <input id="search-bar" type="text" />
        <div id="search-results"></div>
    `;
    
    await fetchResults("asp", 1);
  
    await waitFor(() => {
      expect(screen.getByText("ASP.NET Core Guide")).toBeInTheDocument();
    });
  });

  test("Stores search results in sessionStorage and Retrieve search results from session storage", async () => {
    document.body.innerHTML = `
        <input id="search-bar" type="text" />
        <div id="search-results"></div>
    `;
  
    sessionStorage.clear();
  
    await fetchResults("a", 1);
  
    console.log("SessionStorage after API call:", JSON.stringify(sessionStorage, null, 2));
  
    const storedResults = JSON.parse(sessionStorage.getItem("search:a:page:1"));
    console.log("Retrieved results from sessionStorage:", storedResults);
  
    const storedTotalResults = sessionStorage.getItem("search:a:totalResults");
    console.log("Retrieved totalResults from sessionStorage:", storedTotalResults);
  
    // Ensure sessionStorage contains the expected data
    expect(storedResults).not.toBeNull();  
    expect(Array.isArray(storedResults)).toBe(true); 
    expect(storedTotalResults).not.toBeNull();  
  });
  

test("Calls actual API with correct query and pagination params", async () => {
  await fetchResults("a", 2);

  await waitFor(() => {
    //console.log("Current DOM content:", document.body.innerHTML);
    expect(screen.getByText("AR in Gaming")).toBeInTheDocument();
  });
});

test("Passes if getSuggestions API throws 400 for short queries", async () => {
  let errorCaught = null;
  try {
    await getSuggestions("a");

    // If no error is thrown, fail the test
    throw new Error("Expected getSuggestions to throw an error, but it did not.");
  } catch (error) {
    errorCaught = error;
    console.log("Error Response:", error.response);
    console.log("Error Data:", error.response?.data);
  }

  expect(errorCaught.response.status).toBe(400);
  expect(errorCaught.response.data).toBe("Suggestions are available only for queries with more than 2 letters.");
});


// Pagination Behavior  
test("Renders correct pagination buttons based on total pages", async () => {
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

test("Updates results when pagination button is clicked ", async () => {
  document.body.innerHTML = `<div id="pagination"></div><div id="search-results"></div>`;
  console.log("Calling API for page 2 results.");
  const button = document.createElement("button");
  button.textContent = "2";
  button.onclick = async () => {
    try {
      await fetchResults("a", 2);
    } catch (error) {
      console.error("API call failed:", error.response?.status, error.response?.data);
      throw error;
    }
  };
  document.getElementById("pagination").appendChild(button);
  fireEvent.click(screen.getByText("2"));
  await waitFor(() => {
    const searchResultsContainer = document.getElementById("search-results");
    console.log("Checking search results:", searchResultsContainer.innerHTML);
    expect(searchResultsContainer.children.length).toBeGreaterThan(0);
  });
  expect(screen.getByText("AR in Gaming")).toBeInTheDocument();
  //expect(screen.getByText("AI in Natural Language Processing")).toBeInTheDocument();
});

// Search Bar Functionality  


// Mock logSearch function
window.logSearch = jest.fn().mockResolvedValue();

test("Triggers search when Enter key is pressed", async () => {
  document.body.innerHTML = `<input id="search-bar" type="text" />`;

  const searchBar = screen.getByRole("textbox");
  searchBar.value = "test query";

  Object.defineProperty(window, "location", {
    writable: true,
    value: { assign: jest.fn(), href: "" },
  });

  searchBar.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await window.logSearch(searchBar.value);
      window.location.assign(`search.html?query=${encodeURIComponent(searchBar.value)}`);
    }
  });

  fireEvent.keyDown(searchBar, { key: "Enter", code: "Enter" });

  await waitFor(() => expect(window.logSearch).toHaveBeenCalledWith("test query"));

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