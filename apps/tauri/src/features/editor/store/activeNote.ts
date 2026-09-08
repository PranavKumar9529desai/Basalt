import type { BacklinkEntry } from "../types";
import { create } from "zustand";

/**
 * Minimal active-note state: the open note, its backlinks for the right
 * sidebar, and lightweight stats for the status bar. Deliberately does NOT
 * sync content/saveStatus per keystroke — only what the shell actually
 * renders.
 */
export interface ActiveNoteStore {
  /** The note (path + name) that the active tab has loaded. */
  activeNote: { path: string; name: string } | null;
  /** Backlinks for the active note — shown in the right sidebar. */
  activeNoteBacklinks: BacklinkEntry[];
  setActiveNote: (note: { path: string; name: string } | null) => void;
  setActiveNoteBacklinks: (entries: BacklinkEntry[]) => void;
  /** Live editor stats — consumed by the status bar. */
  chars: number;
  words: number;
  setStats: (stats: { chars: number; words: number }) => void;
}

export const useActiveNoteStore = create<ActiveNoteStore>()((set) => ({
  activeNote: null,
  activeNoteBacklinks: [],
  setActiveNote: (note) => set({ activeNote: note }),
  setActiveNoteBacklinks: (entries) => set({ activeNoteBacklinks: entries }),
  chars: 0,
  words: 0,
  setStats: (stats) => set({ chars: stats.chars, words: stats.words }),
}));
