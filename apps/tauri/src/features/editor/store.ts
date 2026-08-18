import { create } from "zustand";

// ---------------------------------------------------------------------------
// Minimal focused-pane state.
// Tracks which pane is currently focused, the note it has open, the backlinks
// for that note (consumed by the right-hand sidebar), and lightweight editor
// stats (chars/words) consumed by the status bar.
//
// Deliberately NOT syncing content/saveStatus on every keystroke — only what
// the workspace shell actually renders.
// ---------------------------------------------------------------------------

export interface FocusedPaneInfo {
  /** The note (path + name) that the focused pane has loaded. */
  focusedPaneSelected: { path: string; name: string } | null;
  /** Backlinks for the focused note — shown in the right sidebar. */
  focusedPaneBacklinks: string[];
  setFocusedPaneSelected: (note: { path: string; name: string } | null) => void;
  setFocusedPaneBacklinks: (paths: string[]) => void;
  /** Live editor stats — consumed by the status bar. */
  chars: number;
  words: number;
  setStats: (stats: { chars: number; words: number }) => void;
}

export const useFocusedPaneStore = create<FocusedPaneInfo>()((set) => ({
  focusedPaneSelected: null,
  focusedPaneBacklinks: [],
  setFocusedPaneSelected: (note) => set({ focusedPaneSelected: note }),
  setFocusedPaneBacklinks: (paths) => set({ focusedPaneBacklinks: paths }),
  chars: 0,
  words: 0,
  setStats: (stats) => set({ chars: stats.chars, words: stats.words }),
}));