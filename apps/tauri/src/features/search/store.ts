import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { FileMatch, FileResult, SearchContentResult } from "./types";

// Guards against out-of-order responses (a slower earlier query returning after a
// newer one) overwriting fresher results — the classic search-as-you-type flicker.
let latestSearchSeq = 0;
let latestSwitcherSeq = 0;
/** Total number of matching lines across all files (the flattened result set). */
const countMatches = (results: FileMatch[]): number =>
  results.reduce((n, f) => n + f.matches.length, 0);

interface SearchStore {
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: FileMatch[];
  searchTotalHits: number;
  isSearchLoading: boolean;
  searchSelectedIndex: number;

  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  runSearch: (query: string) => Promise<void>;
  searchSelectNext: () => void;
  searchSelectPrev: () => void;

  isSwitcherOpen: boolean;
  switcherQuery: string;
  switcherResults: FileResult[];
  switcherSelectedIndex: number;

  openSwitcher: () => void;
  closeSwitcher: () => void;
  setSwitcherQuery: (query: string) => void;
  runSwitcher: (query: string) => Promise<void>;
  switcherSelectNext: () => void;
  switcherSelectPrev: () => void;
}

export const useSearchStore = create<SearchStore>()((set, get) => ({
  isSearchOpen: false,
  searchQuery: "",
  searchTotalHits: 0,
  searchResults: [],
  isSearchLoading: false,
  searchSelectedIndex: 0,

  openSearch: () =>
    set({
      isSearchOpen: true,
      searchQuery: "",
      searchResults: [],
      searchSelectedIndex: 0,
      isSearchLoading: false,
    }),
  closeSearch: () => set({ isSearchOpen: false }),

  setSearchQuery: (query) =>
    set({ searchQuery: query, searchSelectedIndex: 0 }),

  runSearch: async (query) => {
    const seq = ++latestSearchSeq;
    const q = query.trim();
    if (q.length < 2) {
      set({
        searchResults: [],
        searchTotalHits: 0,
        searchSelectedIndex: 0,
        isSearchLoading: false,
      });
      return;
    }
    set({ isSearchLoading: true });
    try {
      const res = await invoke<SearchContentResult>("search_content", {
        query: q,
        limit: 20,
      });
      if (seq !== latestSearchSeq) return; // stale response, discard
      set({
        searchResults: res.files,
        searchTotalHits: res.totalHits,
        searchSelectedIndex: 0,
        isSearchLoading: false,
      });
    } catch (err) {
      if (seq !== latestSearchSeq) return;
      console.error("[search] search_content error:", err);
      set({ isSearchLoading: false });
    }
  },

  searchSelectNext: () => {
    const { searchSelectedIndex, searchResults } = get();
    const total = countMatches(searchResults);
    if (total === 0) return;
    set({
      searchSelectedIndex: (searchSelectedIndex + 1) % total,
    });
  },
  searchSelectPrev: () => {
    const { searchSelectedIndex, searchResults } = get();
    const total = countMatches(searchResults);
    if (total === 0) return;
    set({ searchSelectedIndex: (searchSelectedIndex - 1 + total) % total });
  },

  isSwitcherOpen: false,
  switcherQuery: "",
  switcherResults: [],
  switcherSelectedIndex: 0,

  openSwitcher: () => {
    set({
      isSwitcherOpen: true,
      switcherQuery: "",
      switcherResults: [],
      switcherSelectedIndex: 0,
    });
    // Pre-load all files immediately so the switcher isn't empty on open.
    invoke<FileResult[]>("search_files", { query: "", limit: 20 })
      .then((results) => set({ switcherResults: results }))
      .catch((err) => console.error("[search] search_files error:", err));
  },
  closeSwitcher: () => set({ isSwitcherOpen: false }),

  setSwitcherQuery: (query) => set({ switcherQuery: query }),

  runSwitcher: async (query) => {
    const seq = ++latestSwitcherSeq;
    const q = query.trim();
    if (q.length < 2) {
      set({ switcherResults: [], switcherSelectedIndex: 0 });
      return;
    }
    try {
      const results = await invoke<FileResult[]>("search_files", {
        query: q,
        limit: 20,
      });
      if (seq !== latestSwitcherSeq) return; // stale response, discard
      set({ switcherResults: results, switcherSelectedIndex: 0 });
    } catch (err) {
      if (seq !== latestSwitcherSeq) return;
      console.error("[search] search_files error:", err);
    }
  },

  switcherSelectNext: () => {
    const { switcherSelectedIndex, switcherResults } = get();
    if (switcherResults.length === 0) return;
    set({
      switcherSelectedIndex: Math.min(
        switcherSelectedIndex + 1,
        switcherResults.length - 1,
      ),
    });
  },
  switcherSelectPrev: () => {
    const { switcherSelectedIndex } = get();
    set({ switcherSelectedIndex: Math.max(switcherSelectedIndex - 1, 0) });
  },
}));
