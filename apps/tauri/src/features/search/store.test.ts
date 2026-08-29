import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import type { FileMatch, FileResult } from "./types";

import { useSearchStore } from "./store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const content = (path: string, title: string): FileMatch => ({
  path,
  title,
  score: 1,
  text: "",
  matches: [
    {
      lineNumber: 1,
      text: "match line",
      highlights: [],
      contextBefore: [],
      contextAfter: [],
    },
  ],
});

const file = (path: string, title: string): FileResult => ({ path, title, score: 1 });

const initial = {
  isSearchOpen: false,
  searchQuery: "",
  searchResults: [] as FileMatch[],
  searchTotalHits: 0,
  isSearchLoading: false,
  searchSelectedIndex: 0,
  isSwitcherOpen: false,
  switcherQuery: "",
  switcherResults: [] as FileResult[],
  switcherSelectedIndex: 0,
};

describe("useSearchStore", () => {
  beforeEach(() => {
    useSearchStore.setState(initial);
    vi.mocked(invoke).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("search modal", () => {
    it("openSearch opens and resets all search state", () => {
      useSearchStore.setState({ isSearchLoading: true, searchSelectedIndex: 3 });
      useSearchStore.getState().openSearch();
      expect(useSearchStore.getState().isSearchOpen).toBe(true);
      expect(useSearchStore.getState().searchQuery).toBe("");
      expect(useSearchStore.getState().searchResults).toEqual([]);
      expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
      expect(useSearchStore.getState().isSearchLoading).toBe(false);
    });

    it("closeSearch only flips the open flag", () => {
      useSearchStore.getState().openSearch();
      useSearchStore.getState().closeSearch();
      expect(useSearchStore.getState().isSearchOpen).toBe(false);
    });

    it("setSearchQuery updates the query and resets the selected index", () => {
      useSearchStore.setState({ searchSelectedIndex: 4 });
      useSearchStore.getState().setSearchQuery("hello");
      expect(useSearchStore.getState().searchQuery).toBe("hello");
      expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
    });

    it("runSearch gates on empty/whitespace queries and never invokes", async () => {
      await useSearchStore.getState().runSearch("   ");
      expect(vi.mocked(invoke)).not.toHaveBeenCalled();
      expect(useSearchStore.getState().searchResults).toEqual([]);
      expect(useSearchStore.getState().isSearchLoading).toBe(false);
    });

    it("runSearch invokes search_content with limit 20 and stores results", async () => {
      vi.mocked(invoke).mockResolvedValue({
        files: [content("a.md", "A")],
        totalHits: 5,
      });
      await useSearchStore.getState().runSearch("needle");
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("search_content", {
        query: "needle",
        limit: 20,
      });
      expect(useSearchStore.getState().searchResults).toEqual([content("a.md", "A")]);
      expect(useSearchStore.getState().searchTotalHits).toBe(5);
      expect(useSearchStore.getState().isSearchLoading).toBe(false);
    });

    it("runSearch clears the loading flag and keeps results on error", async () => {
      useSearchStore.setState({
        searchResults: [content("old.md", "Old")],
      });
      vi.mocked(invoke).mockRejectedValue(new Error("boom"));
      await useSearchStore.getState().runSearch("x");
      expect(useSearchStore.getState().isSearchLoading).toBe(false);
      expect(useSearchStore.getState().searchResults).toEqual([content("old.md", "Old")]);
    });

    it("searchSelectNext is a no-op with no results", () => {
      useSearchStore.getState().searchSelectNext();
      expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
    });

    it("searchSelectNext clamps at the last result", () => {
      useSearchStore.setState({
        searchResults: [content("a", "A"), content("b", "B"), content("c", "C")],
        searchSelectedIndex: 1,
      });
      useSearchStore.getState().searchSelectNext();
      expect(useSearchStore.getState().searchSelectedIndex).toBe(2);
      useSearchStore.getState().searchSelectNext();
      expect(useSearchStore.getState().searchSelectedIndex).toBe(2);
    });

    it("searchSelectPrev clamps at 0", () => {
      useSearchStore.setState({ searchResults: [content("a", "A")], searchSelectedIndex: 1 });
      useSearchStore.getState().searchSelectPrev();
      expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
      useSearchStore.getState().searchSelectPrev();
      expect(useSearchStore.getState().searchSelectedIndex).toBe(0);
    });
  });

  describe("quick switcher", () => {
    it("openSwitcher opens, resets, and preloads files via search_files", async () => {
      vi.mocked(invoke).mockResolvedValue([file("f.md", "F")]);
      await act(async () => useSearchStore.getState().openSwitcher());
      expect(useSearchStore.getState().isSwitcherOpen).toBe(true);
      expect(useSearchStore.getState().switcherQuery).toBe("");
      expect(useSearchStore.getState().switcherSelectedIndex).toBe(0);
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("search_files", {
        query: "",
        limit: 20,
      });
      expect(useSearchStore.getState().switcherResults).toEqual([file("f.md", "F")]);
    });

    it("closeSwitcher flips the open flag", () => {
      useSearchStore.setState({ isSwitcherOpen: true });
      useSearchStore.getState().closeSwitcher();
      expect(useSearchStore.getState().isSwitcherOpen).toBe(false);
    });

    it("setSwitcherQuery updates the query", () => {
      useSearchStore.getState().setSwitcherQuery("foo");
      expect(useSearchStore.getState().switcherQuery).toBe("foo");
    });

    it("runSwitcher invokes search_files and resets the selected index", async () => {
      useSearchStore.setState({ switcherSelectedIndex: 3 });
      vi.mocked(invoke).mockResolvedValue([file("a.md", "A"), file("b.md", "B")]);
      await useSearchStore.getState().runSwitcher("a");
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("search_files", {
        query: "a",
        limit: 20,
      });
      expect(useSearchStore.getState().switcherResults).toEqual([
        file("a.md", "A"),
        file("b.md", "B"),
      ]);
      expect(useSearchStore.getState().switcherSelectedIndex).toBe(0);
    });

    it("runSwitcher keeps results on error", async () => {
      useSearchStore.setState({ switcherResults: [file("old.md", "Old")] });
      vi.mocked(invoke).mockRejectedValue(new Error("boom"));
      await useSearchStore.getState().runSwitcher("x");
      expect(useSearchStore.getState().switcherResults).toEqual([file("old.md", "Old")]);
    });

    it("switcherSelectNext clamps at the last result", () => {
      useSearchStore.setState({
        switcherResults: [file("a", "A"), file("b", "B")],
        switcherSelectedIndex: 0,
      });
      useSearchStore.getState().switcherSelectNext();
      expect(useSearchStore.getState().switcherSelectedIndex).toBe(1);
      useSearchStore.getState().switcherSelectNext();
      expect(useSearchStore.getState().switcherSelectedIndex).toBe(1);
    });

    it("switcherSelectPrev clamps at 0", () => {
      useSearchStore.setState({ switcherResults: [file("a", "A")], switcherSelectedIndex: 1 });
      useSearchStore.getState().switcherSelectPrev();
      expect(useSearchStore.getState().switcherSelectedIndex).toBe(0);
    });
  });
});
