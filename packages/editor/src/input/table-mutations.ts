// ---------------------------------------------------------------------------
// Table source mutations — pure functions for manipulating markdown table text.
//
// These operate on the raw markdown source of a table (the text between the
// Table node's `from`/`to` in the CM6 document). All functions are pure:
// input string → output string + new cursor offset. No CM6 dependency.
//
// Split layout: the table model + parse/serialize live in table-source.ts,
// column operations in table-columns.ts; this module re-exports them so the
// public surface (used by table-navigation.ts keybindings, the table widget,
// and apps/tauri context menu commands) is unchanged.
// ---------------------------------------------------------------------------
import {
  padCells,
  parseTableSource,
  serializeTableSource,
  type MutationResult,
  type TableSource,
} from "./table-source";

export {
  parseTableSource,
  serializeTableSource,
  type MutationResult,
  type TableSource,
} from "./table-source";
export {
  deleteColumn,
  insertColumnLeft,
  insertColumnRight,
} from "./table-columns";

// ---------------------------------------------------------------------------
// Mutations — each returns { text, cursor } where cursor is an offset within
// the new text (0-based), suitable for positioning after the change.
// ---------------------------------------------------------------------------

function emptyRow(colCount: number): string[] {
  return Array.from({ length: colCount }, () => "");
}

// --- Update cell text ---

/** Update a cell's text content. rowIdx: 0 is header row, 1+ is body row. */
export function updateCellText(
  raw: string,
  rowIdx: number,
  colIdx: number,
  newText: string,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (rowIdx < 0 || rowIdx >= model.rows.length) return null;
  if (colIdx < 0 || colIdx >= model.colCount) return null;

  // Sanitize any newlines or unescaped pipes inside table cell text to preserve table integrity
  const clean = newText.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const newRows = model.rows.map((r, ri) => {
    if (ri !== rowIdx) return [...r];
    const copy = padCells(r, model.colCount);
    copy[colIdx] = clean.trim();
    return copy;
  });

  const newModel: TableSource = { ...model, rows: newRows };
  const text = serializeTableSource(newModel);
  return { text, cursor: 0 };
}

// --- Insert row ---

function insertRow(model: TableSource, afterRow: number): MutationResult {
  const newRows = [
    ...model.rows.slice(0, afterRow + 1),
    emptyRow(model.colCount),
    ...model.rows.slice(afterRow + 1),
  ];
  const newModel: TableSource = { ...model, rows: newRows };
  const text = serializeTableSource(newModel);

  // Cursor lands in the first cell of the new row.
  // Find the offset of the new row's first cell.
  const newLineIndex = afterRow + 1; // row index + 1 for delimiter = line index
  let cursor = 0;
  const lines = text.split("\n");
  for (let i = 0; i < newLineIndex; i++) {
    cursor += lines[i].length + 1;
  }
  // +2 to skip "| " at the start of the line.
  cursor += 2;

  return { text, cursor };
}

/** Insert an empty row above the given row index. */
export function insertRowAbove(
  raw: string,
  rowIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (rowIdx <= 0) return null; // can't insert above header
  return insertRow(model, rowIdx - 1);
}

/** Insert an empty row below the given row index. */
export function insertRowBelow(
  raw: string,
  rowIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  return insertRow(model, rowIdx);
}

/** Delete the row at the given index. Can't delete header or last body row. */
export function deleteRow(raw: string, rowIdx: number): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (rowIdx <= 0) return null; // can't delete header
  if (model.rows.length <= 2) return null; // header + 1 body = can't delete last body

  const newRows = [
    ...model.rows.slice(0, rowIdx),
    ...model.rows.slice(rowIdx + 1),
  ];
  const newModel: TableSource = { ...model, rows: newRows };
  const text = serializeTableSource(newModel);

  // Cursor lands on the row above (clamped).
  const targetRow = Math.min(rowIdx, newModel.rows.length - 1);
  let cursor = 0;
  const lines = text.split("\n");
  // targetRow maps to line: 0 → 0, else targetRow + 1 (skip delimiter)
  const targetLine = targetRow === 0 ? 0 : targetRow + 1;
  for (let i = 0; i < targetLine; i++) {
    cursor += lines[i].length + 1;
  }
  cursor += 2;

  return { text, cursor };
}

// --- Move row ---

/** Move the row at the given index up by one position. Can't move header. */
export function moveRowUp(raw: string, rowIdx: number): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (rowIdx <= 0) return null; // can't move header
  if (rowIdx >= model.rows.length) return null;

  const newRows = [...model.rows];
  // Swap rowIdx with rowIdx-1.
  [newRows[rowIdx - 1], newRows[rowIdx]] = [
    newRows[rowIdx],
    newRows[rowIdx - 1],
  ];
  const newModel: TableSource = { ...model, rows: newRows };
  const text = serializeTableSource(newModel);

  let cursor = 0;
  const lines = text.split("\n");
  // Row moved to rowIdx-1. Line index: header→0, else rowIdx (skip delimiter).
  const targetLineIdx = rowIdx - 1 === 0 ? 0 : rowIdx;
  for (let i = 0; i < targetLineIdx; i++) {
    cursor += lines[i].length + 1;
  }
  cursor += 2;

  return { text, cursor };
}

/** Move the row at the given index down by one position. */
export function moveRowDown(
  raw: string,
  rowIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (rowIdx <= 0) return null; // can't move header
  if (rowIdx >= model.rows.length - 1) return null; // already last row

  const newRows = [...model.rows];
  [newRows[rowIdx], newRows[rowIdx + 1]] = [
    newRows[rowIdx + 1],
    newRows[rowIdx],
  ];
  const newModel: TableSource = { ...model, rows: newRows };
  const text = serializeTableSource(newModel);

  // Cursor stays on the same row (now at rowIdx+1).
  let cursor = 0;
  const lines = text.split("\n");
  const targetLineIdx = rowIdx + 1; // rowIdx+1, and since rowIdx >= 1, this is >= 2 → line = rowIdx+1
  for (let i = 0; i < targetLineIdx; i++) {
    cursor += lines[i].length + 1;
  }
  cursor += 2;

  return { text, cursor };
}

export type Alignment = "left" | "center" | "right" | "none";

/** Set the alignment for a column in the delimiter row. */
export function setAlignment(
  raw: string,
  colIdx: number,
  alignment: Alignment,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (colIdx < 0 || colIdx >= model.colCount) return null;
  // Cannot align the header row itself — only body columns.
  const newAlignments = [...model.alignments];
  newAlignments[colIdx] = alignment;
  const newModel: TableSource = { ...model, alignments: newAlignments };
  const text = serializeTableSource(newModel);
  // Cursor stays at the same absolute position within the table.
  // Since only delimiter changes (and lengths of alignment chars are ≤4),
  // compute delta from old to new alignment cell widths.
  let cursor = 0;
  const newLines = text.split("\n");
  // Recount: cursor was at pos within original; recompute by finding the
  // same logical line. For simplicity, anchor to the header line end + offset
  // into the original doc. Since we're replacing the whole table, place
  // cursor at the start of the cell in the header row (colIdx + 1 th pipe).
  const headerLine = newLines[0];
  let pipeCount = 0;
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] === "|") {
      if (pipeCount === colIdx + 1) {
        cursor = i + 2; // after "| "
        break;
      }
      pipeCount++;
    }
  }
  if (cursor === 0) cursor = 2;

  return { text, cursor };
}
