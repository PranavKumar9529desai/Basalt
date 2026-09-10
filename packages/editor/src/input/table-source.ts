// ---------------------------------------------------------------------------
// Table source model — parsing and serialization of raw markdown table text.
//
// Pure functions: input string → structured `TableSource`, and back to text.
// No CM6 dependency. Shared by table-mutations.ts (row/cell ops) and
// table-columns.ts (column ops); each mutation returns `MutationResult`
// (new text + cursor offset).
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

export interface MutationResult {
  text: string;
  /** Cursor offset within the new table text (0-based). */
  cursor: number;
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

export function padCells(cells: string[], colCount: number): string[] {
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
