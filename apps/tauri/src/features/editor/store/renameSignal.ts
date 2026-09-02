import { create } from "zustand";

/**
 * One-way rename signal from chrome (F2 keybinding, ⋮ "Rename note" menu,
 * future rename commands) to the inline title of the note currently open in
 * a given tab. The markdown leaf subscribes and bumps a render epoch for its
 * title root; the InlineTitle baselines its mount-time epoch so tab switches
 * never re-enter rename mode, only new signals do.
 */
export interface RenameSignalStore {
  /** Tab whose note should enter rename mode. */
  tabId: string | null;
  /** Monotonic signal counter — the actual "did a new signal happen" bit. */
  seq: number;
  /** Ask the note open in `tabId` to start an inline rename. */
  request: (tabId: string) => void;
}

export const useRenameSignalStore = create<RenameSignalStore>()((set) => ({
  tabId: null,
  seq: 0,
  request: (tabId) => set((s) => ({ tabId, seq: s.seq + 1 })),
}));
