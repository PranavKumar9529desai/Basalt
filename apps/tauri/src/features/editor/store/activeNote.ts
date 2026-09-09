import type { BacklinkEntry } from "../types";
import { create } from "zustand";

/**
 * Minimal active-note state: the open note and its backlinks for the right
 * sidebar. Deliberately does NOT sync content/saveStatus per keystroke — only
 * what the shell actually renders.
 */
export interface ActiveNoteStore {
  /** The note (path + name) that the active tab has loaded. */
  activeNote: { path: string; name: string } | null;
  /** Backlinks for the active note — shown in the right sidebar. */
  activeNoteBacklinks: BacklinkEntry[];
  setActiveNote: (note: { path: string; name: string } | null) => void;
  setActiveNoteBacklinks: (entries: BacklinkEntry[]) => void;
}

export const useActiveNoteStore = create<ActiveNoteStore>()((set) => ({
  activeNote: null,
  activeNoteBacklinks: [],
  setActiveNote: (note) => set({ activeNote: note }),
  setActiveNoteBacklinks: (entries) => set({ activeNoteBacklinks: entries }),
}));
