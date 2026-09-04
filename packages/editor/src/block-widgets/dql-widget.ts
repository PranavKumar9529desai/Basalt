import { Facet, type EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import { escapeHtml, notifyViewOfSizeChange } from "./utils";

// ---------------------------------------------------------------------------
// Query result types — mirrors crates/basalt-types/src/query.rs exactly.
// ---------------------------------------------------------------------------

export type TypedValue =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "date"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "link"; name: string; path: string }
  | { type: "null" };

export interface QueryColumn {
  name: string;
  type: "text" | "number" | "date" | "checkbox" | "link";
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: TypedValue[][];
  total: number;
}

// ---------------------------------------------------------------------------
// Dependency facet — injected by the feature layer so this package stays pure
// (ADR-022 rule 2 / ADR-007: no Tauri, no IPC in packages/ui).
// ---------------------------------------------------------------------------

export type RunQueryFn = (dql: string) => Promise<QueryResult>;

export const runQueryFacet = Facet.define<
  RunQueryFn | undefined,
  RunQueryFn | undefined
>({
  combine: (values) => values[0],
});

/** Open a note by name (resolved to a path by the feature layer). */
export type OpenLinkFn = (name: string) => void;

export const openLinkFacet = Facet.define<
  OpenLinkFn | undefined,
  OpenLinkFn | undefined
>({
  combine: (values) => values[0],
});

// ---------------------------------------------------------------------------
// Result cache — keyed by query text. Cleared when vault reindexes.
// Lives at module scope; each widget's toDOM checks before fetching.
// ---------------------------------------------------------------------------

const queryCache = new Map<string, QueryResult>();

export function clearQueryCache(): void {
  queryCache.clear();
}

// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

function renderCellHtml(value: TypedValue): string {
  switch (value.type) {
    case "text":
      return escapeHtml(value.value);
    case "number":
      return String(value.value);
    case "date":
      return `<span class="cm-dql-date">${escapeHtml(value.value)}</span>`;
    case "checkbox":
      return value.value
        ? '<span class="cm-dql-check cm-dql-check--on">✓</span>'
        : '<span class="cm-dql-check cm-dql-check--off">✗</span>';
    case "link":
      return `<a class="internal-link cm-dql-link" data-href="${escapeHtml(value.path)}" data-name="${escapeHtml(value.name)}">${escapeHtml(value.name)}</a>`;
    case "null":
      return '<span class="cm-dql-null">—</span>';
  }
}

function renderTableHtml(result: QueryResult): string {
  if (result.columns.length === 0 || result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const headerHtml = result.columns
    .map((col) => `<th class="cm-dql-th">${escapeHtml(col.name)}</th>`)
    .join("");
  const rowsHtml = result.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td class="cm-dql-td">${renderCellHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<table class="cm-dql-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>${footer}`;
}

function renderListHtml(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const itemsHtml = result.rows
    .map((row) => {
      const cell = row[0];
      return cell
        ? `<li class="cm-dql-list-item">${renderCellHtml(cell)}</li>`
        : "";
    })
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<ul class="cm-dql-list">${itemsHtml}</ul>${footer}`;
}

function renderTaskHtml(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const itemsHtml = result.rows
    .map((row) => {
      const linkCell = row[0];
      const taskCell = row[1];
      const linkHtml = linkCell ? renderCellHtml(linkCell) : "";
      const taskText = taskCell?.type === "text" ? taskCell.value : "";
      return `<li class="cm-dql-task-item"><span class="cm-dql-task-link">${linkHtml}</span> <span class="cm-dql-task-text">${escapeHtml(taskText)}</span></li>`;
    })
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<ul class="cm-dql-task-list">${itemsHtml}</ul>${footer}`;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

interface DqlModel {
  queryText: string;
  /** Character offsets within the doc (for replace decorations). */
  from: number;
  to: number;
}

export class DqlResultWidget extends WidgetType {
  constructor(
    private readonly queryText: string,
    private readonly runQuery: RunQueryFn | undefined,
    private readonly onOpenLink: OpenLinkFn | undefined,
  ) {
    super();
  }

  eq(other: DqlResultWidget): boolean {
    return this.queryText === other.queryText;
  }
  /** Attach a delegated click handler so result links open notes via onOpenLink. */
  private bindLinks(div: HTMLElement): void {
    const onOpenLink = this.onOpenLink;
    if (!onOpenLink) return;
    div.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a.internal-link");
      if (!anchor) return;
      event.preventDefault();
      const name = anchor.getAttribute("data-name") ?? anchor.textContent ?? "";
      if (name) onOpenLink(name.trim());
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-dql-result";

    // Synchronous fast path: render from cache
    const cached = queryCache.get(this.queryText);
    if (cached) {
      div.innerHTML = renderDqlResult(cached);
      this.bindLinks(div);
      return div;
    }

    // Async path: show loading, fetch in background
    div.innerHTML = '<div class="cm-dql-loading">Loading query…</div>';
    this.bindLinks(div);

    if (this.runQuery) {
      const queryText = this.queryText;
      this.runQuery(queryText)
        .then((result) => {
          queryCache.set(queryText, result);
          div.innerHTML = renderDqlResult(result);
          this.bindLinks(div);
          notifyViewOfSizeChange(div, view);
        })
        .catch((err) => {
          div.innerHTML = `<div class="cm-dql-error">Query error: ${escapeHtml(String(err))}</div>`;
          notifyViewOfSizeChange(div, view);
        });
    } else {
      div.innerHTML =
        '<div class="cm-dql-error">Query engine not available</div>';
    }

    return div;
  }

  ignoreEvent() {
    return false; // allow clicks on links
  }
}

// ---------------------------------------------------------------------------
// Result rendering — infers query type from column structure
// ---------------------------------------------------------------------------

function renderDqlResult(result: QueryResult): string {
  // LIST: 1 column "File" with type "link"
  const isList =
    result.columns.length === 1 &&
    result.columns[0].type === "link" &&
    result.columns[0].name === "File";
  // TASK: 2 columns "File" + "Task"
  const isTask =
    result.columns.length === 2 &&
    result.columns[0].type === "link" &&
    result.columns[1].name === "Task";

  if (isList) return renderListHtml(result);
  if (isTask) return renderTaskHtml(result);
  return renderTableHtml(result);
}

// ---------------------------------------------------------------------------
// Theme — uses --sat-* tokens only (ADR-002)
// ---------------------------------------------------------------------------

export const DQL_WIDGET_THEME = EditorView.baseTheme({
  ".cm-dql-result": {
    padding: "0.5em 0",
    fontSize: "0.9em",
    fontFamily: "inherit",
  },
  ".cm-dql-loading": {
    color: "var(--sat-text-secondary, #94a3b8)",
    fontStyle: "italic",
    padding: "0.25em 0",
  },
  ".cm-dql-error": {
    color: "var(--sat-state-error, #ef4444)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.85em",
    padding: "0.5em",
    backgroundColor: "var(--sat-surface-2, #1e1e2e)",
    borderRadius: "4px",
  },
  ".cm-dql-empty": {
    color: "var(--sat-text-secondary, #94a3b8)",
    fontStyle: "italic",
    padding: "0.25em 0",
  },
  ".cm-dql-table": {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "inherit",
  },
  ".cm-dql-th": {
    textAlign: "left",
    padding: "0.4em 0.8em",
    borderBottom: "2px solid var(--sat-layout-border, #334155)",
    color: "var(--sat-text-primary, #e2e8f0)",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  ".cm-dql-td": {
    padding: "0.35em 0.8em",
    borderBottom: "1px solid var(--sat-layout-border, #334155)",
    color: "var(--sat-text-secondary, #cbd5e1)",
    maxWidth: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-dql-td:hover": {
    whiteSpace: "normal",
    overflow: "visible",
  },
  ".cm-dql-link": {
    color: "var(--sat-accent-primary, #60a5fa)",
    textDecoration: "none",
    cursor: "pointer",
  },
  ".cm-dql-link:hover": {
    textDecoration: "underline",
  },
  ".cm-dql-list": {
    listStyle: "disc",
    paddingLeft: "1.5em",
    margin: "0",
  },
  ".cm-dql-list-item": {
    padding: "0.15em 0",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-dql-task-list": {
    listStyle: "none",
    paddingLeft: "0",
    margin: "0",
  },
  ".cm-dql-task-item": {
    padding: "0.15em 0",
    display: "flex",
    gap: "0.4em",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-dql-task-text": {
    color: "var(--sat-text-primary, #e2e8f0)",
  },
  ".cm-dql-check": {
    fontWeight: "bold",
  },
  ".cm-dql-check--on": {
    color: "var(--sat-state-success, #22c55e)",
  },
  ".cm-dql-check--off": {
    color: "var(--sat-text-muted, #64748b)",
  },
  ".cm-dql-date": {
    color: "var(--sat-accent-secondary, #a78bfa)",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-dql-null": {
    color: "var(--sat-text-muted, #64748b)",
    fontStyle: "italic",
  },
  ".cm-dql-footer": {
    paddingTop: "0.35em",
    fontSize: "0.8em",
    color: "var(--sat-text-muted, #64748b)",
  },
});

// ---------------------------------------------------------------------------
// Note on CM block-widget layout: multi-line block widgets must use
// `block: true` (registry.ts), so CM draws them *between* lines in their own
// block slot. Vertical PADDING on the container is fine (it's inside the box
// and measured), but block widgets must not rely on vertical MARGIN, which
// collapses out of CM's height measurement — prefer padding for spacing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BlockWidgetSpec — registered in the live-preview walk
// ---------------------------------------------------------------------------

/** Language tags that activate the DQL widget (case-insensitive). */
const DQL_LANGUAGES: Record<string, true> = {
  dql: true,
  dataview: true,
};

const matches = (node: SyntaxNodeRef): boolean =>
  node.type.name === "FencedCode";

interface DqlBlockSpecModel extends DqlModel {
  inCursor: boolean;
}

const parse = (
  state: EditorState,
  node: SyntaxNodeRef,
): DqlBlockSpecModel | null => {
  if (node.type.name !== "FencedCode") return null;

  const doc = state.doc;
  const startLine = doc.lineAt(node.from);
  const langMatch = startLine.text.match(/^```([^\s]*)/);
  const lang = langMatch ? langMatch[1].toLowerCase() : "";
  if (!(lang in DQL_LANGUAGES)) return null;

  // Extract query body (everything between opening and closing fences).
  const endLine = doc.lineAt(node.to);
  const bodyStart = startLine.to + 1;
  const bodyEnd = endLine.from;
  const queryText =
    bodyStart < bodyEnd ? doc.sliceString(bodyStart, bodyEnd).trim() : "";

  if (!queryText) return null;

  const headPos = state.selection.main.head;
  // In reading mode the caret must not collapse the query to raw code; only
  // reveal raw source when actively editing (live preview).
  const inCursor =
    state.facet(renderModeFacet) === "live" &&
    headPos >= node.from &&
    headPos <= node.to;

  return { queryText, from: node.from, to: endLine.to, inCursor };
};

const span = (
  model: DqlBlockSpecModel,
): { from: number; to: number } | null => {
  if (model.inCursor) return null;
  return { from: model.from, to: model.to };
};

const renderWidget = (
  model: DqlBlockSpecModel,
  state: EditorState,
): DqlResultWidget | null => {
  if (model.inCursor) return null;
  return new DqlResultWidget(
    model.queryText,
    state.facet(runQueryFacet),
    state.facet(openLinkFacet),
  );
};

export const dqlBlockSpec: BlockWidgetSpec<DqlBlockSpecModel> = {
  id: "dql",
  matches,
  parse,
  span,
  render: renderWidget,
};
