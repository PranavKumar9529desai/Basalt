import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { useSearchStore } from "./store";
import type { ContentResult, FileResult } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const DEFAULTS = {
  isSearchOpen: false,
  searchQuery: "",
  searchResults: [] as ContentResult[],
  isSearchLoading: false,
  searchSelectedIndex: 0,
  isSwitcherOpen: false,
  switcherQuery: "",
  switcherResults: [] as FileResult[],
  switcherSelectedIndex: 0,
};

beforeEach(() => {
  useSearchStore.setState({ ...DEFAULTS });
  mockedInvoke.mockReset();
  // openSwitcher fires invoke(...).then(...) without awaiting; the mock must
  // return a resolved promise or the .then chain throws.
  mockedInvoke.mockResolvedValue([]);
});

describe("search store", () => {
  it("openSearch opens and resets the search surface", () => {
    useSearchStore.setState({
      searchQuery: "old",
      searchResults: [{ path: "x", title: "X", score: 0, snippets: [] }],
    });
    useSearchStore.getState().openSearch();
    const s = useSearchStore.getState();
    expect(s.isSearchOpen).toBe(true);
    expect(s.searchQuery).toBe("");
    expect(s.searchResults).toEqual([]);
    expect(s.searchSelectedIndex).toBe(0);
  });

  it("closeSearch closes", () => {
    useSearchStore.getState().openSearch();
    useSearchStore.getState().closeSearch();
    expect(useSearchStore.getState().isSearchOpen).toBe(false);
  });

  it("setSearchQuery resets the selected index", () => {
    useSearchStore.setState({ searchSelectedIndex: 3 });
    useSearchStore.getState().setSearchQuery("foo");
    expect(useSearchStore.getState().searchQuery).toBe("foo");
    expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
  });

  it("runSearch with empty query clears results without invoking", async () => {
    useSearchStore.setState({
      searchResults: [{ path: "x", title: "X", score: 0, snippets: [] }],
    });
    await useSearchStore.getState().runSearch("   ");
    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(useSearchStore.getState().searchResults).toEqual([]);
    expect(useSearchStore.getState().isSearchLoading).toBe(false);
  });

  it("runSearch invokes search_content and stores results", async () => {
    const results = [
      { path: "a.md", title: "A", score: 0, snippets: [] },
    ] as ContentResult[];
    mockedInvoke.mockResolvedValue(results);
    await useSearchStore.getState().runSearch("term");
    expect(mockedInvoke).toHaveBeenCalledWith("search_content", {
      query: "term",
      limit: 20,
    });
    expect(useSearchStore.getState().searchResults).toEqual(results);
    expect(useSearchStore.getState().isSearchLoading).toBe(false);
  });

  it("runSearch surfaces errors without throwing", async () => {
    mockedInvoke.mockRejectedValue(new Error("boom"));
    await useSearchStore.getState().runSearch("term");
    expect(useSearchStore.getState().isSearchLoading).toBe(false);
    expect(useSearchStore.getState().searchResults).toEqual([]);
  });

  it("searchSelectNext/Prev clamp to bounds", () => {
    const results = [
      { path: "a", title: "a", score: 0, snippets: [] },
      { path: "b", title: "b", score: 0, snippets: [] },
      { path: "c", title: "c", score: 0, snippets: [] },
    ] as ContentResult[];
    useSearchStore.setState({ searchResults: results, searchSelectedIndex: 0 });
    useSearchStore.getState().searchSelectNext();
    expect(useSearchStore.getState().searchSelectedIndex).toBe(1);
    useSearchStore.getState().searchSelectNext();
    useSearchStore.getState().searchSelectNext();
    expect(useSearchStore.getState().searchSelectedIndex).toBe(2);
    useSearchStore.getState().searchSelectPrev();
    expect(useSearchStore.getState().searchSelectedIndex).toBe(1);
    useSearchStore.getState().searchSelectPrev();
    useSearchStore.getState().searchSelectPrev();
    expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
  });

  it("searchSelectNext is a no-op on empty results", () => {
    useSearchStore.setState({ searchResults: [], searchSelectedIndex: 0 });
    useSearchStore.getState().searchSelectNext();
    expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
  });

  it("openSwitcher triggers a file preload and opens the surface", () => {
    useSearchStore.getState().openSwitcher();
    expect(useSearchStore.getState().isSwitcherOpen).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith("search_files", {
      query: "",
      limit: 20,
    });
  });

  it("runSwitcher invokes search_files and stores results", async () => {
    const files = [{ path: "a.md" }] as FileResult[];
    mockedInvoke.mockResolvedValue(files);
    await useSearchStore.getState().runSwitcher("q");
    expect(mockedInvoke).toHaveBeenCalledWith("search_files", {
      query: "q",
      limit: 20,
    });
    expect(useSearchStore.getState().switcherResults).toEqual(files);
    expect(useSearchStore.getState().switcherSelectedIndex).toBe(0);
  });

  it("switcherSelectNext/Prev clamp to bounds", () => {
    const files = [{ path: "a" }, { path: "b" }] as FileResult[];
    useSearchStore.setState({ switcherResults: files, switcherSelectedIndex: 0 });
    useSearchStore.getState().switcherSelectNext();
    expect(useSearchStore.getState().switcherSelectedIndex).toBe(1);
    useSearchStore.getState().switcherSelectNext();
    expect(useSearchStore.getState().switcherSelectedIndex).toBe(1);
    useSearchStore.getState().switcherSelectPrev();
    useSearchStore.getState().switcherSelectPrev();
    expect(useSearchStore.getState().switcherSelectedIndex).toBe(0);
  });
});
