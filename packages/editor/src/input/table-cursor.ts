// ---------------------------------------------------------------------------
// Table cursor tracking — notifies the host when the editor cursor enters
// or leaves a markdown table. Used by the table controls sidebar to
// enable/disable buttons.
// ---------------------------------------------------------------------------
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tablePositionAtCursor } from "./table-navigation";

/** Lightweight table cursor snapshot for the host (no CM6 deps). */
export interface TableCursorState {
  inTable: boolean;
  row: number;
  col: number;
}

/**
 * Create a CM6 extension that calls `onChange` whenever the cursor crosses
 * a table boundary (enters/leaves) or moves within a table.
 *
 * Debounced: only fires when `row:col` actually changes to avoid thrashing
 * React re-renders on every arrow-key tap.
 */
export function tableCursorExtension(
  onChange: (state: TableCursorState | null) => void,
): Extension {
  let prev: string | null = null;

  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;

    const pos = tablePositionAtCursor(update.state);
    const key = pos ? `${pos.row}:${pos.col}` : null;

    if (key === prev) return;
    prev = key;

    onChange(pos ? { inTable: true, row: pos.row, col: pos.col } : null);
  });
}
