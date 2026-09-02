import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { FileMatch, FileResult, SearchContentResult } from "./types";

// Guards against out-of-order responses (a slower earlier query returning after a
// newer one) overwriting fresher results — the classic search-as-you-type flicker.
let latestSearchSeq = 0;
let latestSwitcherSeq = 0;
let latestPreviewSeq = 0;
/** Number of line matches in the bounded result window shown in the modal. */
const countMatches = (results: FileMatch[]): number =>
  results.reduce((n, f) => n + f.matches.length, 0);

interface SearchStore {
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: FileMatch[];
  searchTotalHits: number;
  isSearchLoading: boolean;
  searchError: string | null;
  searchSelectedIndex: number;
  previewPath: string | null;
  previewText: string | null;
  isPreviewLoading: boolean;
  previewError: string | null;

  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  runSearch: (query: string) => Promise<void>;
  searchSelectNext: () => void;
  searchSelectPrev: () => void;
  loadPreview: (path: string) => Promise<void>;

  isSwitcherOpen: boolean;
  switcherQuery: string;
  switcherResults: FileResult[];
  switcherSelectedIndex: number;
  isSwitcherLoading: boolean;
  switcherError: string | null;

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
  searchError: null,
  searchSelectedIndex: 0,
  previewPath: null,
  previewText: null,
  isPreviewLoading: false,
  previewError: null,

  openSearch: () => {
    latestSearchSeq++;
    latestPreviewSeq++;
    set({
      isSearchOpen: true,
      searchQuery: "",
      searchResults: [],
      searchSelectedIndex: 0,
      isSearchLoading: false,
      searchError: null,
      previewPath: null,
      previewText: null,
      isPreviewLoading: false,
      previewError: null,
    });
  },
  closeSearch: () => {
    latestSearchSeq++;
    latestPreviewSeq++;
    set({ isSearchOpen: false, isPreviewLoading: false });
  },

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
        searchError: null,
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
        searchError: null,
      });
    } catch (err) {
      if (seq !== latestSearchSeq) return;
      console.error("[search] search_content error:", err);
      set({ isSearchLoading: false, searchError: "Search failed. Try again." });
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

  loadPreview: async (path) => {
    const seq = ++latestPreviewSeq;
    set({
      previewPath: path,
      previewText: null,
      isPreviewLoading: true,
      previewError: null,
    });
    try {
      const text = await invoke<string>("open_file", { path });
      if (seq !== latestPreviewSeq) return;
      set({ previewPath: path, previewText: text, isPreviewLoading: false });
    } catch (err) {
      if (seq !== latestPreviewSeq) return;
      console.error("[search] preview open_file error:", err);
      set({ isPreviewLoading: false, previewError: "Preview unavailable." });
    }
  },

  isSwitcherOpen: false,
  switcherQuery: "",
  switcherResults: [],
  switcherSelectedIndex: 0,
  isSwitcherLoading: false,
  switcherError: null,

  openSwitcher: () => {
    const seq = ++latestSwitcherSeq;
    set({
      isSwitcherOpen: true,
      switcherQuery: "",
      switcherResults: [],
      switcherSelectedIndex: 0,
      isSwitcherLoading: true,
      switcherError: null,
    });
    // Pre-load all files immediately so the switcher isn't empty on open.
    invoke<FileResult[]>("search_files", { query: "", limit: 20 })
      .then((results) => {
        if (seq === latestSwitcherSeq) {
          set({ switcherResults: results, isSwitcherLoading: false });
        }
      })
      .catch((err) => {
        if (seq !== latestSwitcherSeq) return;
        console.error("[search] search_files error:", err);
        set({ isSwitcherLoading: false, switcherError: "File search failed." });
      });
  },
  closeSwitcher: () => {
    latestSwitcherSeq++;
    set({ isSwitcherOpen: false, isSwitcherLoading: false });
  },

  setSwitcherQuery: (query) => set({ switcherQuery: query }),

  runSwitcher: async (query) => {
    const seq = ++latestSwitcherSeq;
    const q = query.trim();
    if (q.length < 2) {
      set({
        switcherResults: [],
        switcherSelectedIndex: 0,
        isSwitcherLoading: false,
        switcherError: null,
      });
      return;
    }
    set({ isSwitcherLoading: true, switcherError: null });
    try {
      const results = await invoke<FileResult[]>("search_files", {
        query: q,
        limit: 20,
      });
      if (seq !== latestSwitcherSeq) return; // stale response, discard
      set({
        switcherResults: results,
        switcherSelectedIndex: 0,
        isSwitcherLoading: false,
      });
    } catch (err) {
      if (seq !== latestSwitcherSeq) return;
      console.error("[search] search_files error:", err);
      set({ isSwitcherLoading: false, switcherError: "File search failed." });
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
