import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";

// ---------------------------------------------------------------------------
// Table block widget — renders markdown tables as rich <table> HTML.
//
// Same pattern as html-block.ts:
// - Cursor INSIDE the table → null (raw source stays editable)
// - Cursor OUTSIDE the table → rich <table> widget (rendered)
//
// The table text is parsed into rows/columns with column alignment detected
// from the delimiter row (:---, :---:, ---:).
// ---------------------------------------------------------------------------

interface TableBlockModel {
  /** Raw markdown table text. */
  raw: string;
  /** Parsed header row cells. */
  headers: string[];
  /** Parsed body rows, each an array of cell strings. */
  body: string[][];
  /** Column alignments: "left" | "center" | "right" | "none". */
  alignments: ("left" | "center" | "right" | "none")[];
  /** Whether the cursor is currently inside this table. */
  active: boolean;
  /** Document positions. */
  from: number;
  to: number;
}

// ---------------------------------------------------------------------------
// Markdown table text parser (zero-dependency, handles edge cases)
// ---------------------------------------------------------------------------

function parseMarkdownTable(raw: string): {
  headers: string[];
  body: string[][];
  alignments: TableBlockModel["alignments"];
} {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], body: [], alignments: [] };

  const splitCells = (line: string): string[] => {
    const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((c) => c.trim());
  };

  const headers = splitCells(lines[0]);

  // Detect alignment from delimiter row (line 1)
  const delimiter = lines[1];
  const delimCells = splitCells(delimiter);
  const alignments: TableBlockModel["alignments"] = delimCells.map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });

  // Pad alignments to match header count
  while (alignments.length < headers.length) alignments.push("none");

  const body: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    body.push(splitCells(lines[i]));
  }

  return { headers, body, alignments };
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render inline markdown: [[wikilinks]], **bold**, *italic*, `code`. */
function renderInlineCell(text: string): string {
  let result = escapeHtml(text);

  // [[target]] or [[target|alias]]
  result = result.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const [target, alias] = inner.split("|");
    const display = alias ?? target;
    return `<span class="cm-table-link">${escapeHtml(display)}</span>`;
  });

  // **bold**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // *italic*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // `code`
  result = result.replace(/`(.+?)`/g, "<code>$1</code>");

  return result;
}

function buildTableHtml(model: TableBlockModel): string {
  const { headers, body, alignments } = model;

  let html = '<table class="cm-table-rendered">';

  // <thead>
  html += "<thead><tr>";
  for (let i = 0; i < headers.length; i++) {
    const a = alignments[i] ?? "none";
    const styleAttr =
      a === "left"
        ? ' style="text-align:left"'
        : a === "center"
          ? ' style="text-align:center"'
          : a === "right"
            ? ' style="text-align:right"'
            : "";
    html += `<th${styleAttr}>${renderInlineCell(headers[i])}</th>`;
  }
  html += "</tr></thead>";

  // <tbody>
  html += "<tbody>";
  for (let r = 0; r < body.length; r++) {
    const rowClass = r % 2 === 1 ? ' class="cm-table-row-alt"' : "";
    html += `<tr${rowClass}>`;
    for (let c = 0; c < headers.length; c++) {
      const a = alignments[c] ?? "none";
      const styleAttr =
        a === "left"
          ? ' style="text-align:left"'
          : a === "center"
            ? ' style="text-align:center"'
            : a === "right"
              ? ' style="text-align:right"'
              : "";
      const cell = body[r]?.[c] ?? "";
      html += `<td${styleAttr}>${renderInlineCell(cell)}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";

  return html;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class TableBlockWidget extends WidgetType {
  constructor(readonly model: TableBlockModel) {
    super();
  }

  eq(other: TableBlockWidget): boolean {
    return this.model.raw === other.model.raw;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-block";
    wrapper.innerHTML = buildTableHtml(this.model);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// BlockWidgetSpec
// ---------------------------------------------------------------------------

const matches = (node: SyntaxNodeRef): boolean => node.type.name === "Table";

const parse = (
  state: EditorState,
  node: SyntaxNodeRef,
): TableBlockModel | null => {
  const raw = state.doc.sliceString(node.from, node.to);
  const { headers, body, alignments } = parseMarkdownTable(raw);
  if (headers.length === 0) return null;

  const head = state.selection.main.head;
  const headLine = state.doc.lineAt(head).number;
  const blockFromLine = state.doc.lineAt(node.from).number;
  const blockToLine = state.doc.lineAt(node.to).number;
  const active = headLine >= blockFromLine && headLine <= blockToLine;

  return {
    raw,
    headers,
    body,
    alignments,
    active,
    from: node.from,
    to: node.to,
  };
};

const span = (model: TableBlockModel): { from: number; to: number } => ({
  from: model.from,
  to: model.to,
});

const render = (
  model: TableBlockModel,
  _state: EditorState,
): TableBlockWidget | null => {
  // Cursor inside → show raw source (editable). Cursor outside → show rich table.
  if (model.active) return null;
  return new TableBlockWidget(model);
};

export const tableBlockSpec: BlockWidgetSpec<TableBlockModel> = {
  id: "table-block",
  matches,
  parse,
  render,
  span,
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const TABLE_BLOCK_THEME = EditorView.baseTheme({
  ".cm-table-block": {
    padding: "0.5rem 0",
    overflowX: "auto",
  },
  ".cm-table-block table.cm-table-rendered": {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "0.9em",
    margin: "0.25rem 0",
  },
  ".cm-table-block th": {
    fontWeight: "700",
    textAlign: "left",
    padding: "0.4rem 0.75rem",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
    color: "var(--sat-table-header-color, #e2e8f0)",
    whiteSpace: "nowrap",
  },
  ".cm-table-block td": {
    padding: "0.35rem 0.75rem",
    borderBottom: "1px solid var(--sat-layout-divider, rgba(255,255,255,0.06))",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  ".cm-table-block tr.cm-table-row-alt td": {
    background: "var(--sat-surface-2, rgba(255,255,255,0.02))",
  },
  ".cm-table-block .cm-table-link": {
    color: "var(--sat-accent-primary, #60a5fa)",
    cursor: "pointer",
  },
  ".cm-table-block .cm-table-link:hover": {
    textDecoration: "underline",
  },
});
