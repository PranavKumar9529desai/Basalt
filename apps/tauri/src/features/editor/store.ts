import { create } from "zustand";

// ---------------------------------------------------------------------------
// Minimal focused-pane selection state.
// Only tracks what pane is currently focused + what note it has open.
// No more syncing content/backlinks/saveStatus on every keystroke.
// ---------------------------------------------------------------------------

export interface FocusedPaneState {
  /** The note (path + name) that the focused pane has loaded. */
  focusedPaneSelected: { path: string; name: string } | null;
  setFocusedPaneSelected: (note: { path: string; name: string } | null) => void;
}

export const useFocusedPaneStore = create<FocusedPaneState>()((set) => ({
  focusedPaneSelected: null,
  setFocusedPaneSelected: (note) => set({ focusedPaneSelected: note }),
}));
