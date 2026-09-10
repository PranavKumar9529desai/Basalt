// ---------------------------------------------------------------------------
// Table column mutations — insert/delete columns in raw markdown table text.
//
// Split out of table-mutations.ts: each mutation is pure (input string →
// output string + cursor offset), built on the shared table-source model.
// ---------------------------------------------------------------------------

import {
  parseTableSource,
  serializeTableSource,
  type MutationResult,
  type TableSource,
} from "./table-source";

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
