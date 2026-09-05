import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import {
  classifyMediaExtension,
  extensionOf,
} from "../input/embed-utils";
import { resolveAssetFacet } from "../types";
import { escapeHtml } from "./utils";

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

type ResolveAssetFn = (target: string) => string | null;

/**
 * Decode the three entities `escapeHtml` produces so an embed target captured
 * from already-escaped cell text can be passed to `resolveAsset` verbatim.
 */
function htmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Real media element for a resolvable `![[target]]` embed (ADR-034 part B). */
function embedMediaHtml(
  kind: "image" | "video" | "audio",
  url: string,
  name: string,
): string {
  const attrs =
    ' class="cm-table-link cm-table-media" data-name="' + escapeHtml(name) + '"';
  switch (kind) {
    case "image":
      return `<img${attrs} src="${escapeHtml(url)}" alt="${escapeHtml(
        name,
      )}" loading="lazy">`;
    case "video":
      return `<video${attrs} src="${escapeHtml(
        url,
      )}" controls preload="metadata"></video>`;
    case "audio":
      return `<audio${attrs} src="${escapeHtml(url)}" controls></audio>`;
  }
}

/** Highlighted table-cell link carrying the resolved target for clicks. */
function tableLinkHtml(target: string, display: string): string {
  return `<span class="cm-table-link" data-name="${escapeHtml(
    target,
  )}">${display}</span>`;
}

/**
 * Render inline markdown: `[[wikilinks]]` (optionally `!`-prefixed media
 * embeds), **bold**, *italic*, `code`. `resolve` resolves an embed target to a
 * loadable URL; aliased links and unresolvable/non-media targets stay links
 * (the `!` is an embed only when it becomes real media).
 */
function renderInlineCell(
  text: string,
  resolve: ResolveAssetFn | undefined,
): string {
  let result = escapeHtml(text);

  result = result.replace(/(!?)\[\[([^\]]+)\]\]/g, (_m, bang: string, inner: string) => {
    const [target, alias] = inner.split("|");
    const cleanTarget = target.split("#")[0].trim();
    const display = alias?.trim() || cleanTarget;

    // `![[target]]` without an alias → real media when the target resolves so;
    // an alias turns an embed into a plain link (Obsidian rule).
    if (bang && !alias && resolve) {
      const url = resolve(htmlDecode(cleanTarget));
      if (url) {
        const kind = classifyMediaExtension(extensionOf(cleanTarget));
        if (kind === "image" || kind === "video" || kind === "audio") {
          return embedMediaHtml(kind, url, cleanTarget);
        }
      }
    }
    return tableLinkHtml(cleanTarget, display);
  });

  // **bold**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // *italic*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // `code`
  result = result.replace(/`(.+?)`/g, "<code>$1</code>");

  return result;
}

function buildTableHtml(model: TableBlockModel, resolve: ResolveAssetFn | undefined): string {
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
    html += `<th${styleAttr}>${renderInlineCell(headers[i], resolve)}</th>`;
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
      html += `<td${styleAttr}>${renderInlineCell(cell, resolve)}</td>`;
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
  constructor(
    readonly model: TableBlockModel,
    readonly html: string,
  ) {
    super();
  }

  eq(other: TableBlockWidget): boolean {
    return this.model.raw === other.model.raw && this.html === other.html;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-block";
    wrapper.innerHTML = this.html;
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
  // In reading mode the caret must not collapse the table to raw source; only
  // reveal raw syntax when actively editing (live preview).
  const active =
    state.facet(renderModeFacet) === "live" &&
    headLine >= blockFromLine &&
    headLine <= blockToLine;

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
  state: EditorState,
): TableBlockWidget | null => {
  // Cursor inside → show raw source (editable). Cursor outside → show rich table.
  if (model.active) return null;
  const html = buildTableHtml(model, state.facet(resolveAssetFacet));
  return new TableBlockWidget(model, html);
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
  ".cm-table-block .cm-table-media": {
    maxWidth: "100%",
    maxHeight: "360px",
    borderRadius: "6px",
    verticalAlign: "middle",
    whiteSpace: "normal",
  },
  ".cm-table-block img.cm-table-media": {
    cursor: "pointer",
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
