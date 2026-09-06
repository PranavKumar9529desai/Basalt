import { StateEffect, StateField, type EditorState } from "@codemirror/state";

export interface TableRawRange {
  from: number;
  to: number;
}

/** State effect to set or clear the table in raw mode. */
export const setTableRawMode = StateEffect.define<TableRawRange | null>();

/**
 * StateField tracking which table block (if any) is currently forced into raw
 * Markdown mode. Automatically clears when the cursor moves outside the table.
 */
export const tableRawModeField = StateField.define<TableRawRange | null>({
  create: () => null,

  update(current, tr) {
    // Process explicit effects first
    for (const effect of tr.effects) {
      if (effect.is(setTableRawMode)) {
        current = effect.value;
      }
    }

    if (!current) return null;

    // Map positions across document changes
    if (tr.docChanged) {
      const from = tr.changes.mapPos(current.from, -1);
      const to = tr.changes.mapPos(current.to, 1);
      if (from >= to) return null;
      current = { from, to };
    }

    // Auto-clear when cursor/selection moves completely outside the table
    if (tr.selection || tr.docChanged) {
      const head = tr.state.selection.main.head;
      if (head < current.from || head > current.to) {
        return null;
      }
    }

    return current;
  },
});

/** Check if a table node spanning [from, to] is currently in raw mode. */
export function isTableInRawMode(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const rawRange = state.field(tableRawModeField, false);
  if (!rawRange) return false;
  return Math.max(from, rawRange.from) < Math.min(to, rawRange.to);
}
