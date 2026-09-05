import { create } from "zustand";

/**
 * Table cursor state — updated by the CM6 tableCursorExtension when the
 * cursor enters/leaves/moves within a markdown table. Consumed by the
 * table controls sidebar to enable/disable buttons.
 */
export interface TableCursorStore {
  /** Current table cursor state, or null when cursor is outside a table. */
  tableCursor: { inTable: boolean; row: number; col: number } | null;
  setTableCursor: (
    state: { inTable: boolean; row: number; col: number } | null,
  ) => void;
}

export const useTableCursorStore = create<TableCursorStore>()((set) => ({
  tableCursor: null,
  setTableCursor: (state) => set({ tableCursor: state }),
}));
