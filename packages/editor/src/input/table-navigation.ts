import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { moveRowUp, moveRowDown, setAlignment } from "./table-mutations";
import type { Alignment, MutationResult } from "./table-mutations";

import type { SyntaxNode } from "@lezer/common";

// ---------------------------------------------------------------------------
// Table cell navigation — Tab/Shift-Tab/Enter inside native markdown tables.
//
// Works on the RAW SOURCE (the cursor is inside the table, so the block widget
// has already revealed the source text — see table-widget.ts's `active` gate).
// Cell boundaries are derived from `|` pipe positions in each TableRow line,
// using the same approach as parseMarkdownTable() in table-widget.ts.
//
// Behavior (matches Obsidian's Advanced Tables plugin):
//   Tab        → next cell; wraps to next row; appends a row at the last cell
//                of the last row.
//   Shift-Tab  → previous cell; wraps to previous row; no-op at the very start.
//   Enter      → appends a row only at the last cell of the LAST row (matches
//                Tab); otherwise falls through to CM6's default newline so
//                multi-line cell content stays possible.
// ---------------------------------------------------------------------------

/** Find the innermost `Table` node containing `pos`, or null. */
export function tableNodeAt(
  state: EditorState,
  pos: number,
): SyntaxNode | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolve(pos, -1);
  while (node) {
    if (node.type.name === "Table") return node;
    node = node.parent;
  }
  return null;
}

/** Absolute doc offsets of every `|` in a line. */
export function pipePositions(lineText: string, lineFrom: number): number[] {
  const pipes: number[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === "|") pipes.push(lineFrom + i);
  }
  return pipes;
}

/** The editable row children of a Table, skipping the separator row (`|---|---|`). */
export function rowsOf(table: SyntaxNode): SyntaxNode[] {
  const rows: SyntaxNode[] = [];
  let child = table.firstChild;
  while (child) {
    if (child.name === "TableHeader" || child.name === "TableRow")
      rows.push(child);
    child = child.nextSibling;
  }
  return rows;
}

interface CellInfo {
  rowIndex: number;
  /** 0-based cell index within the row. */
  col: number;
  /** Number of cells in this row. */
  cellCount: number;
  /** Pipe positions of the cursor's row. */
  pipes: number[];
}

/**
 * Resolve the cursor to a cell within a table. Returns null when the cursor is
 * not on a well-formed TableRow line (e.g. the delimiter row).
 */
export function cellAt(
  state: EditorState,
  head: number,
  table: SyntaxNode,
): CellInfo | null {
  const rows = rowsOf(table);
  const line = state.doc.lineAt(head);

  for (let r = 0; r < rows.length; r++) {
    const rowLine = state.doc.lineAt(rows[r].from);
    if (rowLine.number !== line.number) continue;

    const pipes = pipePositions(rowLine.text, rowLine.from);
    if (pipes.length < 2) return null; // not a well-formed table row

    const cellCount = pipes.length - 1;
    let before = 0;
    for (const p of pipes) if (p < head) before++;
    // Cell index = number of pipes strictly before the cursor, minus the
    // leading pipe; clamp into range for boundary positions.
    let col = before - 1;
    if (col < 0) col = 0;
    if (col > cellCount - 1) col = cellCount - 1;

    return { rowIndex: r, col, cellCount, pipes };
  }

  return null; // cursor not on any row line (delimiter / gap)
}

function moveToCell(view: EditorView, from: number): void {
  view.dispatch({
    selection: { anchor: from, head: from },
    scrollIntoView: true,
  });
}

/** Append a new empty row of `cells` columns after the table; focus first cell. */
export function appendRow(
  view: EditorView,
  table: SyntaxNode,
  cells: number,
): boolean {
  const to = table.to;
  // Empty row: "|  |  | ... |" — one "  " cell per column.
  const newRow = "|" + "  |".repeat(cells);
  // First cell content starts after "\n" + "| " → to + 2.
  const firstCell = to + 2;
  view.dispatch({
    changes: { from: to, insert: "\n" + newRow },
    selection: { anchor: firstCell, head: firstCell },
    scrollIntoView: true,
  });
  return true;
}

/** Tab — next cell, wrapping rows, appending at the table's end. */
export function tabForward(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const table = tableNodeAt(state, head);
  if (!table) return false;

  const info = cellAt(state, head, table);
  if (!info) return false;
  const { rowIndex, col, cellCount, pipes } = info;
  const rows = rowsOf(table);

  if (col === cellCount - 1) {
    // Last cell of this row.
    if (rowIndex === rows.length - 1) {
      return appendRow(view, table, cellCount);
    }
    // Wrap to the first cell of the next row.
    const nextLine = state.doc.lineAt(rows[rowIndex + 1].from);
    const nextPipes = pipePositions(nextLine.text, nextLine.from);
    moveToCell(view, nextPipes[0] + 1);
    return true;
  }

  // Next cell in the same row: opening pipe of cell (col+1).
  moveToCell(view, pipes[col + 1] + 1);
  return true;
}

/** Shift-Tab — previous cell, wrapping rows, no-op at the table's start. */
export function tabBackward(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const table = tableNodeAt(state, head);
  if (!table) return false;

  const info = cellAt(state, head, table);
  if (!info) return false;
  const { rowIndex, col, pipes } = info;
  const rows = rowsOf(table);

  if (col === 0) {
    // First cell of this row.
    if (rowIndex === 0) return false; // nothing before — let default handle it.
    // Wrap to the last cell of the previous row.
    const prevLine = state.doc.lineAt(rows[rowIndex - 1].from);
    const prevPipes = pipePositions(prevLine.text, prevLine.from);
    // Last cell index = prevPipes.length - 2 (drop leading + trailing pipes).
    moveToCell(view, prevPipes[prevPipes.length - 2] + 1);
    return true;
  }

  // Previous cell in the same row: opening pipe of cell (col-1).
  moveToCell(view, pipes[col - 1] + 1);
  return true;
}

/** Enter — append a row at the last cell of the last row; else default newline. */
export function enterInTable(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const table = tableNodeAt(state, head);
  if (!table) return false;

  const info = cellAt(state, head, table);
  if (!info) return false;
  const { rowIndex, col, cellCount } = info;
  const rows = rowsOf(table);

  if (rowIndex !== rows.length - 1) return false; // mid-table → newline (multiline)
  if (col !== cellCount - 1) return false; // not the last cell → newline

  return appendRow(view, table, cellCount);
}

// ---------------------------------------------------------------------------
// Row/column mutation keybindings + application helper.
// ---------------------------------------------------------------------------

/**
 * Resolve the cursor to a row index (0 = header, 1+ = body) and column index
 * within a table. Used by keybindings AND context menu commands.
 * Returns null when the cursor is not on a well-formed table row.
 */
export function tablePositionAtCursor(
  state: EditorState,
): { row: number; col: number; raw: string; table: SyntaxNode } | null {
  const head = state.selection.main.head;
  const table = tableNodeAt(state, head);
  if (!table) return null;
  const info = cellAt(state, head, table);
  if (!info) return null;
  return {
    row: info.rowIndex,
    col: info.col,
    raw: state.doc.sliceString(table.from, table.to),
    table,
  };
}

/**
 * Apply a table mutation to the editor. Resolves the table at cursor, calls
 * the mutation function with the raw source, and dispatches the change.
 * Returns true if the mutation was applied.
 */
export function applyTableMutation(
  view: EditorView,
  mutate: (raw: string) => MutationResult | null,
): boolean {
  const pos = tablePositionAtCursor(view.state);
  if (!pos) return false;
  const result = mutate(pos.raw);
  if (!result) return false;
  view.dispatch({
    changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
    selection: { anchor: pos.table.from + result.cursor },
  });
  return true;
}

function moveRowBy(view: EditorView, delta: number): boolean {
  const pos = tablePositionAtCursor(view.state);
  if (!pos) return false;
  const fn = delta < 0 ? moveRowUp : moveRowDown;
  const result = fn(pos.raw, pos.row);
  if (!result) return false;
  view.dispatch({
    changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
    selection: { anchor: pos.table.from + result.cursor },
  });
  return true;
}

/** Set the column alignment at the cursor position. */
function setColumnAlignment(view: EditorView, alignment: Alignment): boolean {
  const pos = tablePositionAtCursor(view.state);
  if (!pos) return false;
  const result = setAlignment(pos.raw, pos.col, alignment);
  if (!result) return false;
  view.dispatch({
    changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
    selection: { anchor: pos.table.from + result.cursor },
  });
  return true;
}

export const tableNavigationKeymap: KeyBinding[] = [
  {
    key: "Tab",
    run: tabForward,
    shift: tabBackward,
  },
  {
    key: "Enter",
    run: enterInTable,
  },
  {
    key: "Mod-Shift-ArrowUp",
    run: (view) => moveRowBy(view, -1),
  },
  {
    key: "Mod-Shift-ArrowDown",
    run: (view) => moveRowBy(view, 1),
  },
  {
    key: "Mod-Shift-L",
    run: (view) => setColumnAlignment(view, "left"),
  },
  {
    key: "Mod-Shift-C",
    run: (view) => setColumnAlignment(view, "center"),
  },
  {
    key: "Mod-Shift-R",
    run: (view) => setColumnAlignment(view, "right"),
  },
];
