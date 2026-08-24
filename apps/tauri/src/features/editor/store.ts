import { create } from "zustand";

/**
 * Minimal focused-pane state: the focused pane's open note, backlinks for
 * the right sidebar, and lightweight stats for the status bar. Deliberately
 * does NOT sync content/saveStatus per keystroke — only what the shell
 * actually renders.
 */
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