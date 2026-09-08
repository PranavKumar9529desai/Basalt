import { create } from "zustand";

import {
  canCreateSwitcher,
  countMatches,
  isPreviewSeqCurrent,
  isSearchSeqCurrent,
  isSwitcherSeqCurrent,
  nextPreviewSeq,
  nextSearchSeq,
  nextSwitcherSeq,
  openFileForPreview,
  searchContent,
  searchFiles,
} from "./lib/searchApi";
import type { FileMatch, FileResult } from "./types";

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
  /** Open search with a pre-filled query (tag clicks, link suggestions). */
  openSearchWithQuery: (query: string) => Promise<void>;
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
  switcherCanCreate: boolean;

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
    nextSearchSeq();
    nextPreviewSeq();
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
    nextSearchSeq();
    nextPreviewSeq();
    set({ isSearchOpen: false, isPreviewLoading: false });
  },
  openSearchWithQuery: async (query) => {
    nextSearchSeq();
    nextPreviewSeq();
    // Same reset openSearch performs, but keeping the caller's query instead
    // of clearing it — tag-click prefills must survive the open.
    set({
      isSearchOpen: true,
      searchQuery: query,
      searchResults: [],
      searchSelectedIndex: 0,
      isSearchLoading: false,
      searchError: null,
      previewPath: null,
      previewText: null,
      isPreviewLoading: false,
      previewError: null,
    });
    await get().runSearch(query);
  },

  setSearchQuery: (query) =>
    set({ searchQuery: query, searchSelectedIndex: 0 }),

  runSearch: async (query) => {
    const seq = nextSearchSeq();
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
      const res = await searchContent(q, 20);
      if (!isSearchSeqCurrent(seq)) return; // stale response, discard
      set({
        searchResults: res.files,
        searchTotalHits: res.totalHits,
        searchSelectedIndex: 0,
        isSearchLoading: false,
        searchError: null,
      });
    } catch (err) {
      if (!isSearchSeqCurrent(seq)) return;
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
    const seq = nextPreviewSeq();
    set({
      previewPath: path,
      previewText: null,
      isPreviewLoading: true,
      previewError: null,
    });
    try {
      const text = await openFileForPreview(path);
      if (!isPreviewSeqCurrent(seq)) return;
      set({ previewPath: path, previewText: text, isPreviewLoading: false });
    } catch (err) {
      if (!isPreviewSeqCurrent(seq)) return;
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
  switcherCanCreate: false,

  openSwitcher: () => {
    const seq = nextSwitcherSeq();
    set({
      isSwitcherOpen: true,
      switcherQuery: "",
      switcherResults: [],
      switcherSelectedIndex: 0,
      isSwitcherLoading: true,
      switcherError: null,
      switcherCanCreate: false,
    });
    // Pre-load all files immediately so the switcher isn't empty on open.
    searchFiles("", 20)
      .then((results) => {
        if (isSwitcherSeqCurrent(seq)) {
          set({ switcherResults: results, isSwitcherLoading: false });
        }
      })
      .catch((err) => {
        if (!isSwitcherSeqCurrent(seq)) return;
        console.error("[search] search_files error:", err);
        set({ isSwitcherLoading: false, switcherError: "File search failed." });
      });
  },
  closeSwitcher: () => {
    nextSwitcherSeq();
    set({ isSwitcherOpen: false, isSwitcherLoading: false });
  },

  setSwitcherQuery: (query) =>
    set((s) => ({
      switcherQuery: query,
      switcherCanCreate: canCreateSwitcher(query, s.switcherResults),
    })),

  runSwitcher: async (query) => {
    const seq = nextSwitcherSeq();
    const q = query.trim();
    if (q.length < 2) {
      set({
        switcherResults: [],
        switcherSelectedIndex: 0,
        isSwitcherLoading: false,
        switcherError: null,
        switcherCanCreate: canCreateSwitcher(q, []),
      });
      return;
    }
    set({ isSwitcherLoading: true, switcherError: null });
    try {
      const results = await searchFiles(q, 20);
      if (!isSwitcherSeqCurrent(seq)) return; // stale response, discard
      set({
        switcherResults: results,
        switcherSelectedIndex: 0,
        isSwitcherLoading: false,
        switcherCanCreate: canCreateSwitcher(q, results),
      });
    } catch (err) {
      if (!isSwitcherSeqCurrent(seq)) return;
      console.error("[search] search_files error:", err);
      set({ isSwitcherLoading: false, switcherError: "File search failed." });
    }
  },

  switcherSelectNext: () => {
    const { switcherSelectedIndex, switcherResults, switcherCanCreate } =
      get();
    const last = switcherResults.length - 1 + (switcherCanCreate ? 1 : 0);
    if (last < 0) return;
    set({
      switcherSelectedIndex: Math.min(switcherSelectedIndex + 1, last),
    });
  },
  switcherSelectPrev: () => {
    const { switcherSelectedIndex } = get();
    set({ switcherSelectedIndex: Math.max(switcherSelectedIndex - 1, 0) });
  },
}));
