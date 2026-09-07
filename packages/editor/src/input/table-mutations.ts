// ---------------------------------------------------------------------------
// Table source mutations — pure functions for manipulating markdown table text.
//
// These operate on the raw markdown source of a table (the text between the
// Table node's `from`/`to` in the CM6 document). All functions are pure:
// input string → output string + new cursor offset. No CM6 dependency.
//
// Used by:
//   - table-navigation.ts keybindings (Mod-Shift-ArrowUp/Down)
//   - apps/tauri context menu commands (registered via commandService)
// ---------------------------------------------------------------------------

export interface TableSource {
  /** Raw lines: header, delimiter, body rows. */
  lines: string[];
  /** Cell content per row (header + body), excluding delimiter. */
  rows: string[][];
  /** Column alignments parsed from the delimiter row. */
  alignments: ("left" | "center" | "right" | "none")[];
  /** Number of columns (from header). */
  colCount: number;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function splitCells(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function detectAlignment(cell: string): "left" | "center" | "right" | "none" {
  const t = cell.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

function alignmentChar(a: "left" | "center" | "right" | "none"): string {
  switch (a) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    case "none":
      return "---";
  }
}

/** Parse raw table markdown into a structured representation. */
export function parseTableSource(raw: string): TableSource | null {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const headers = splitCells(lines[0]);
  if (headers.length === 0) return null;

  const alignments = splitCells(lines[1]).map(detectAlignment);
  while (alignments.length < headers.length) alignments.push("none");

  const rows: string[][] = [headers];
  for (let i = 2; i < lines.length; i++) {
    rows.push(splitCells(lines[i]));
  }

  return { lines, rows, alignments, colCount: headers.length };
}

function padCells(cells: string[], colCount: number): string[] {
  const result = [...cells];
  while (result.length < colCount) result.push("");
  return result.slice(0, colCount);
}

/** Serialize a TableSource back to markdown text. */
export function serializeTableSource(model: TableSource): string {
  const { rows, alignments, colCount } = model;

  const headerLine = "| " + padCells(rows[0], colCount).join(" | ") + " |";
  const delimLine =
    "| " + padCells(alignments.map(alignmentChar), colCount).join(" | ") + " |";

  const bodyLines = rows
    .slice(1)
    .map((r) => "| " + padCells(r, colCount).join(" | ") + " |");

  return [headerLine, delimLine, ...bodyLines].join("\n");
}

// ---------------------------------------------------------------------------
// Mutations — each returns { text, cursor } where cursor is an offset within
// the new text (0-based), suitable for positioning after the change.
// ---------------------------------------------------------------------------

export interface MutationResult {
  text: string;
  /** Cursor offset within the new table text (0-based). */
  cursor: number;
}

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

// --- Insert column ---

/** Insert an empty column to the left of the given column index. */
export function insertColumnLeft(
  raw: string,
  colIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (colIdx < 0 || colIdx >= model.colCount) return null;

  const newRows = model.rows.map((row) => {
    const copy = [...row];
    copy.splice(colIdx, 0, "");
    return copy;
  });
  const newAlignments = [...model.alignments];
  newAlignments.splice(colIdx, 0, "none");
  const newModel: TableSource = {
    ...model,
    rows: newRows,
    alignments: newAlignments,
    colCount: model.colCount + 1,
  };
  const text = serializeTableSource(newModel);

  let cursor = 0;
  const lines = text.split("\n");
  const headerLine = lines[0];
  // Count pipes to find the position after colIdx-th pipe.
  let pipeCount = 0;
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] === "|") {
      if (pipeCount === colIdx) {
        cursor = i + 2; // after "| "
        break;
      }
      pipeCount++;
    }
  }
  if (cursor === 0) cursor = 2; // fallback

  return { text, cursor };
}

/** Insert an empty column to the right of the given column index. */
export function insertColumnRight(
  raw: string,
  colIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (colIdx < 0 || colIdx >= model.colCount) return null;

  const newRows = model.rows.map((row) => {
    const copy = [...row];
    copy.splice(colIdx + 1, 0, "");
    return copy;
  });
  const newAlignments = [...model.alignments];
  newAlignments.splice(colIdx + 1, 0, "none");
  const newModel: TableSource = {
    ...model,
    rows: newRows,
    alignments: newAlignments,
    colCount: model.colCount + 1,
  };
  const text = serializeTableSource(newModel);

  // Cursor lands in the new column (now at colIdx+1).
  let cursor = 0;
  const lines = text.split("\n");
  const headerLine = lines[0];
  let pipeCount = 0;
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] === "|") {
      if (pipeCount === colIdx + 1) {
        cursor = i + 2;
        break;
      }
      pipeCount++;
    }
  }
  if (cursor === 0) cursor = 2;

  return { text, cursor };
}

/** Delete the column at the given index. Can't delete the last column. */
export function deleteColumn(
  raw: string,
  colIdx: number,
): MutationResult | null {
  const model = parseTableSource(raw);
  if (!model) return null;
  if (colIdx < 0 || colIdx >= model.colCount) return null;
  if (model.colCount <= 1) return null;

  const newRows = model.rows.map((row) => {
    const copy = [...row];
    copy.splice(colIdx, 1);
    return copy;
  });
  const newAlignments = [...model.alignments];
  newAlignments.splice(colIdx, 1);
  const newModel: TableSource = {
    ...model,
    rows: newRows,
    alignments: newAlignments,
    colCount: model.colCount - 1,
  };
  const text = serializeTableSource(newModel);

  // Cursor lands in the column to the right (clamped).
  const targetCol = Math.min(colIdx, newModel.colCount - 1);
  let cursor = 0;
  const lines = text.split("\n");
  const headerLine = lines[0];
  let pipeCount = 0;
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] === "|") {
      if (pipeCount === targetCol) {
        cursor = i + 2;
        break;
      }
      pipeCount++;
    }
  }
  if (cursor === 0) cursor = 2;

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
