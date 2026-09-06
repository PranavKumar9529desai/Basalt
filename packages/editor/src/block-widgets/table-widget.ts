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
import {
  isTableInRawMode,
  setTableRawMode,
  tableRawModeField,
} from "./table-state";
import {
  insertColumnRight,
  insertRowBelow,
  updateCellText,
} from "../input/table-mutations";

// ---------------------------------------------------------------------------
// Table block widget — renders markdown tables as rich, interactive tables.
//
// In Live Preview:
// - Always rendered by default (no jarring text collapse on focus)
// - Hover/focus reveals top-right code toggle button (</>) to view raw Markdown
// - Hover/focus reveals + button on right to add a column
// - Hover/focus reveals + button at bottom to add a row
// - In-cell direct editing with Tab / Shift-Tab / Enter navigation
// - In Reading mode: clean, read-only rendered table
// ---------------------------------------------------------------------------

export interface TableBlockModel {
  /** Raw markdown table text. */
  raw: string;
  /** Parsed header row cells. */
  headers: string[];
  /** Parsed body rows, each an array of cell strings. */
  body: string[][];
  /** Column alignments: "left" | "center" | "right" | "none". */
  alignments: ("left" | "center" | "right" | "none")[];
  /** Whether this table is currently forced into raw Markdown mode. */
  rawMode: boolean;
  /** Whether the current render mode is live preview. */
  isLive: boolean;
  /** Document positions. */
  from: number;
  to: number;
}

// ---------------------------------------------------------------------------
// Markdown table text parser (zero-dependency, handles edge cases)
// ---------------------------------------------------------------------------

export function parseMarkdownTable(raw: string): {
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
// HTML rendering helpers
// ---------------------------------------------------------------------------

export type ResolveAssetFn = (target: string) => string | null;

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
 * loadable URL; aliased links and unresolvable/non-media targets stay links.
 */
export function renderInlineCell(
  text: string,
  resolve: ResolveAssetFn | undefined,
): string {
  let result = escapeHtml(text);

  result = result.replace(/(!?)\[\[([^\]]+)\]\]/g, (_m, bang: string, inner: string) => {
    const [target, alias] = inner.split("|");
    const cleanTarget = target.split("#")[0].trim();
    const display = alias?.trim() || cleanTarget;

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

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

let pendingTableFocus: { from: number; row: number; col: number } | null = null;

export class TableBlockWidget extends WidgetType {
  private view: EditorView | undefined;

  constructor(
    readonly model: TableBlockModel,
    readonly resolve: ResolveAssetFn | undefined,
  ) {
    super();
  }

  eq(other: TableBlockWidget): boolean {
    return (
      this.model.raw === other.model.raw &&
      this.model.isLive === other.model.isLive &&
      this.model.from === other.model.from &&
      this.model.to === other.model.to
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  private focusCell(root: HTMLElement, row: number, col: number): void {
    const target = root.querySelector<HTMLElement>(
      `[data-row="${row}"][data-col="${col}"]`,
    );
    if (target) {
      target.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // Fallback for jsdom or non-browser environments
      }
    }
  }

  private handleAddColumn(): void {
    if (!this.view) return;
    const lastColIdx = this.model.headers.length - 1;
    const result = insertColumnRight(this.model.raw, lastColIdx);
    if (!result) return;
    pendingTableFocus = {
      from: this.model.from,
      row: 0,
      col: lastColIdx + 1,
    };
    this.view.dispatch({
      changes: { from: this.model.from, to: this.model.to, insert: result.text },
    });
  }

  private handleAddRow(): void {
    if (!this.view) return;
    const lastRowIdx = this.model.body.length;
    const result = insertRowBelow(this.model.raw, lastRowIdx);
    if (!result) return;
    pendingTableFocus = {
      from: this.model.from,
      row: lastRowIdx + 1,
      col: 0,
    };
    this.view.dispatch({
      changes: { from: this.model.from, to: this.model.to, insert: result.text },
    });
  }

  private commitCell(
    rowIdx: number,
    colIdx: number,
    newText: string,
    nextFocus?: { row: number; col: number },
    wrapper?: HTMLElement,
  ): void {
    if (!this.view) return;
    const result = updateCellText(this.model.raw, rowIdx, colIdx, newText);
    if (!result || result.text === this.model.raw) {
      if (nextFocus && wrapper) {
        this.focusCell(wrapper, nextFocus.row, nextFocus.col);
      }
      return;
    }
    if (nextFocus) {
      pendingTableFocus = {
        from: this.model.from,
        row: nextFocus.row,
        col: nextFocus.col,
      };
    }
    this.view.dispatch({
      changes: { from: this.model.from, to: this.model.to, insert: result.text },
    });
  }

  private commitAndAppendRow(
    rowIdx: number,
    colIdx: number,
    newText: string,
    targetCol: number,
  ): void {
    if (!this.view) return;
    let currentRaw = this.model.raw;
    const oldText =
      rowIdx === 0
        ? this.model.headers[colIdx] ?? ""
        : this.model.body[rowIdx - 1]?.[colIdx] ?? "";
    if (newText !== oldText) {
      const cellUpdate = updateCellText(currentRaw, rowIdx, colIdx, newText);
      if (cellUpdate) currentRaw = cellUpdate.text;
    }
    const appendRes = insertRowBelow(currentRaw, this.model.body.length);
    if (!appendRes) return;
    const newRowIdx = this.model.body.length + 1;
    pendingTableFocus = {
      from: this.model.from,
      row: newRowIdx,
      col: targetCol,
    };
    this.view.dispatch({
      changes: { from: this.model.from, to: this.model.to, insert: appendRes.text },
    });
  }

  toDOM(view?: EditorView): HTMLElement {
    this.view = view;
    if (typeof document === "undefined") {
      return {} as HTMLElement;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-block";
    if (this.model.isLive) {
      wrapper.classList.add("cm-table-interactive");
    }

    // 1. Top-Right Code Toggle Button (Live Preview only)
    if (this.model.isLive) {
      const codeBtn = document.createElement("button");
      codeBtn.className = "cm-table-btn-code";
      codeBtn.type = "button";
      codeBtn.title = "Edit as raw Markdown";
      codeBtn.setAttribute("aria-label", "Edit as raw Markdown");
      codeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      codeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.view) return;
        this.view.dispatch({
          effects: setTableRawMode.of({ from: this.model.from, to: this.model.to }),
          selection: { anchor: this.model.from },
        });
        this.view.focus();
      });
      wrapper.appendChild(codeBtn);
    }

    // 2. Build <table> DOM
    const table = document.createElement("table");
    table.className = "cm-table-rendered";

    const { headers, body, alignments } = this.model;
    const totalRows = body.length + 1;
    const totalCols = headers.length;

    // <thead>
    const thead = document.createElement("thead");
    const headerTr = document.createElement("tr");

    const setupCellEvents = (
      cell: HTMLElement,
      rowIdx: number,
      colIdx: number,
    ) => {
      cell.addEventListener("focus", () => {
        cell.textContent = cell.dataset.raw ?? "";
      });

      cell.addEventListener("blur", () => {
        const newText = (cell.textContent ?? "").trim();
        const oldText = (cell.dataset.raw ?? "").trim();
        if (newText !== oldText) {
          cell.dataset.raw = newText;
          this.commitCell(rowIdx, colIdx, newText);
        } else {
          cell.innerHTML = renderInlineCell(newText, this.resolve);
        }
      });

      cell.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain") ?? "";
        const clean = text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
        document.execCommand("insertText", false, clean);
      });

      cell.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const newText = (cell.textContent ?? "").trim();
          const oldText = (cell.dataset.raw ?? "").trim();
          const changed = newText !== oldText;
          if (changed) cell.dataset.raw = newText;

          if (e.shiftKey) {
            let prevRow = rowIdx;
            let prevCol = colIdx - 1;
            if (prevCol < 0) {
              prevRow--;
              prevCol = totalCols - 1;
            }
            if (prevRow >= 0) {
              if (changed) {
                this.commitCell(rowIdx, colIdx, newText, { row: prevRow, col: prevCol }, wrapper);
              } else {
                this.focusCell(wrapper, prevRow, prevCol);
              }
            }
          } else {
            let nextRow = rowIdx;
            let nextCol = colIdx + 1;
            if (nextCol >= totalCols) {
              nextRow++;
              nextCol = 0;
            }
            if (nextRow >= totalRows) {
              this.commitAndAppendRow(rowIdx, colIdx, newText, nextCol);
            } else {
              if (changed) {
                this.commitCell(rowIdx, colIdx, newText, { row: nextRow, col: nextCol }, wrapper);
              } else {
                this.focusCell(wrapper, nextRow, nextCol);
              }
            }
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          const newText = (cell.textContent ?? "").trim();
          const oldText = (cell.dataset.raw ?? "").trim();
          const changed = newText !== oldText;
          if (changed) cell.dataset.raw = newText;

          const nextRow = rowIdx + 1;
          if (nextRow >= totalRows) {
            this.commitAndAppendRow(rowIdx, colIdx, newText, colIdx);
          } else {
            if (changed) {
              this.commitCell(rowIdx, colIdx, newText, { row: nextRow, col: colIdx }, wrapper);
            } else {
              this.focusCell(wrapper, nextRow, colIdx);
            }
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cell.blur();
          this.view?.focus();
        }
      });
    };

    for (let c = 0; c < headers.length; c++) {
      const th = document.createElement("th");
      const a = alignments[c] ?? "none";
      if (a === "left") th.style.textAlign = "left";
      else if (a === "center") th.style.textAlign = "center";
      else if (a === "right") th.style.textAlign = "right";

      th.innerHTML = renderInlineCell(headers[c], this.resolve);

      if (this.model.isLive) {
        th.setAttribute("contenteditable", "plaintext-only");
        try {
          th.contentEditable = "plaintext-only";
        } catch {
          // fallback for non-compliant DOM engines
        }
        th.dataset.row = "0";
        th.dataset.col = String(c);
        th.dataset.raw = headers[c];
        setupCellEvents(th, 0, c);
      }
      headerTr.appendChild(th);
    }

    // Trailing ghost column header (Live Preview only)
    if (this.model.isLive) {
      const ghostColTh = document.createElement("th");
      ghostColTh.className = "cm-table-ghost-col-cell cm-table-ghost-col-th cm-table-add-col-th";
      headerTr.appendChild(ghostColTh);
    }
    thead.appendChild(headerTr);
    table.appendChild(thead);

    // <tbody>
    const tbody = document.createElement("tbody");
    for (let r = 0; r < body.length; r++) {
      const bodyTr = document.createElement("tr");
      if (r % 2 === 1) bodyTr.className = "cm-table-row-alt";

      for (let c = 0; c < headers.length; c++) {
        const td = document.createElement("td");
        const a = alignments[c] ?? "none";
        if (a === "left") td.style.textAlign = "left";
        else if (a === "center") td.style.textAlign = "center";
        else if (a === "right") td.style.textAlign = "right";

        const cellText = body[r]?.[c] ?? "";
        td.innerHTML = renderInlineCell(cellText, this.resolve);

        if (this.model.isLive) {
          td.setAttribute("contenteditable", "plaintext-only");
          try {
            td.contentEditable = "plaintext-only";
          } catch {
            // fallback for non-compliant DOM engines
          }
          td.dataset.row = String(r + 1);
          td.dataset.col = String(c);
          td.dataset.raw = cellText;
          setupCellEvents(td, r + 1, c);
        }
        bodyTr.appendChild(td);
      }

      if (this.model.isLive) {
        const ghostColTd = document.createElement("td");
        ghostColTd.className = "cm-table-ghost-col-cell cm-table-ghost-col-td cm-table-add-col-td";
        bodyTr.appendChild(ghostColTd);
      }
      tbody.appendChild(bodyTr);
    }

    // Trailing ghost row with matching cell divisions (Live Preview only)
    if (this.model.isLive) {
      const ghostRowTr = document.createElement("tr");
      ghostRowTr.className = "cm-table-ghost-row cm-table-add-row-tr";
      for (let c = 0; c < headers.length; c++) {
        const ghostRowCell = document.createElement("td");
        ghostRowCell.className = "cm-table-ghost-row-cell";
        ghostRowTr.appendChild(ghostRowCell);
      }
      // Corner cell for intersection with ghost column
      const ghostCornerCell = document.createElement("td");
      ghostCornerCell.className = "cm-table-ghost-row-cell cm-table-ghost-corner-cell cm-table-add-row-td";
      ghostRowTr.appendChild(ghostCornerCell);
      tbody.appendChild(ghostRowTr);
    }

    table.appendChild(tbody);

    const container = document.createElement("div");
    container.className = "cm-table-container";
    container.appendChild(table);

    // Ghost column "+" button & hover label (Live Preview only)
    if (this.model.isLive) {
      const addColBtn = document.createElement("button");
      addColBtn.className = "cm-table-ghost-btn-col cm-table-add-col-btn";
      addColBtn.type = "button";
      addColBtn.setAttribute("aria-label", "Add column to the right");
      addColBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

      const colLabel = document.createElement("div");
      colLabel.className = "cm-table-ghost-label-col";
      colLabel.textContent = "Add column to the right";

      addColBtn.addEventListener("mouseenter", () => colLabel.classList.add("visible"));
      addColBtn.addEventListener("mouseleave", () => colLabel.classList.remove("visible"));
      addColBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAddColumn();
      });

      // Ghost row "+" button & hover label (Live Preview only)
      const addRowBtn = document.createElement("button");
      addRowBtn.className = "cm-table-ghost-btn-row cm-table-add-row-btn";
      addRowBtn.type = "button";
      addRowBtn.setAttribute("aria-label", "Add row below");
      addRowBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

      const rowLabel = document.createElement("div");
      rowLabel.className = "cm-table-ghost-label-row";
      rowLabel.textContent = "Add row below";

      addRowBtn.addEventListener("mouseenter", () => rowLabel.classList.add("visible"));
      addRowBtn.addEventListener("mouseleave", () => rowLabel.classList.remove("visible"));
      addRowBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAddRow();
      });

      container.appendChild(addColBtn);
      container.appendChild(colLabel);
      container.appendChild(addRowBtn);
      container.appendChild(rowLabel);
    }

    wrapper.appendChild(container);

    // Restore pending focus if any
    if (
      this.model.isLive &&
      pendingTableFocus &&
      pendingTableFocus.from === this.model.from
    ) {
      const { row, col } = pendingTableFocus;
      pendingTableFocus = null;
      setTimeout(() => {
        this.focusCell(wrapper, row, col);
      }, 10);
    }

    return wrapper;
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

  const isLive = state.facet(renderModeFacet) === "live";
  const rawMode = isLive && isTableInRawMode(state, node.from, node.to);

  return {
    raw,
    headers,
    body,
    alignments,
    rawMode,
    isLive,
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
  // If user explicitly toggled raw mode for this table, don't render widget
  if (model.rawMode) return null;
  return new TableBlockWidget(model, state.facet(resolveAssetFacet));
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const TABLE_BLOCK_THEME = EditorView.baseTheme({
  ".cm-table-block": {
    position: "relative",
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
    borderRadius: "var(--sat-layout-radius-md, 6px)",
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
  ".cm-table-btn-code": {
    position: "absolute",
    top: "0.25rem",
    right: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: "var(--sat-layout-radius-md, 6px)",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.05))",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.1))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 150ms ease, color 150ms ease, background-color 150ms ease",
    zIndex: "5",
  },
  ".cm-table-block:hover .cm-table-btn-code, .cm-table-block:focus-within .cm-table-btn-code": {
    opacity: "1",
  },
  ".cm-table-btn-code:hover": {
    color: "var(--sat-text-primary, #f8fafc)",
    background: "var(--sat-surface-3, rgba(255, 255, 255, 0.12))",
  },
  ".cm-table-container": {
    position: "relative",
    display: "inline-block",
    minWidth: "100%",
    paddingBottom: "22px",
  },
  ".cm-table-ghost-col-th": {
    width: "28px",
    minWidth: "28px",
    maxWidth: "28px",
    padding: "0",
    borderLeft: "1px solid transparent",
    borderBottom: "2px solid transparent",
    transition: "border-color 150ms ease",
  },
  ".cm-table-interactive:hover .cm-table-ghost-col-th, .cm-table-interactive:focus-within .cm-table-ghost-col-th": {
    borderLeft: "1px solid var(--sat-table-border, #334155)",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
  },
  ".cm-table-ghost-col-td": {
    width: "28px",
    minWidth: "28px",
    maxWidth: "28px",
    padding: "0",
    borderLeft: "1px solid transparent",
    borderBottom: "1px solid transparent",
    transition: "border-color 150ms ease",
  },
  ".cm-table-interactive:hover .cm-table-ghost-col-td, .cm-table-interactive:focus-within .cm-table-ghost-col-td": {
    borderLeft: "1px solid var(--sat-table-border, #334155)",
    borderBottom: "1px solid var(--sat-layout-divider, rgba(255,255,255,0.06))",
  },
  ".cm-table-ghost-row td": {
    height: "24px",
    padding: "0",
    borderBottom: "1px solid transparent",
    borderRight: "1px solid transparent",
    borderLeft: "1px solid transparent",
    transition: "border-color 150ms ease",
  },
  ".cm-table-interactive:hover .cm-table-ghost-row td, .cm-table-interactive:focus-within .cm-table-ghost-row td": {
    borderBottom: "1px solid var(--sat-table-border, #334155)",
    borderRight: "1px solid var(--sat-table-border, #334155)",
  },
  ".cm-table-interactive:hover .cm-table-ghost-row td:first-child, .cm-table-interactive:focus-within .cm-table-ghost-row td:first-child": {
    borderLeft: "1px solid var(--sat-table-border, #334155)",
  },
  ".cm-table-ghost-btn-col": {
    position: "absolute",
    right: "4px",
    top: "calc(50% - 11px)",
    transform: "translateY(-50%)",
    width: "20px",
    height: "20px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    border: "1px solid var(--sat-layout-border, rgba(255,255,255,0.15))",
    background: "var(--sat-surface-2, rgba(255,255,255,0.06))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    opacity: "0",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 150ms ease, background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    zIndex: "4",
  },
  ".cm-table-interactive:hover .cm-table-ghost-btn-col, .cm-table-interactive:focus-within .cm-table-ghost-btn-col": {
    opacity: "0.6",
    pointerEvents: "auto",
  },
  ".cm-table-ghost-btn-col:hover": {
    opacity: "1",
    background: "var(--sat-accent-primary, #60a5fa)",
    color: "var(--sat-surface-1, #0f172a)",
    borderColor: "var(--sat-accent-primary, #60a5fa)",
  },
  ".cm-table-ghost-label-col": {
    position: "absolute",
    right: "0",
    bottom: "2px",
    fontSize: "0.75rem",
    color: "var(--sat-text-muted, #94a3b8)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 120ms ease",
    textAlign: "right",
  },
  ".cm-table-ghost-label-col.visible": {
    opacity: "1",
  },
  ".cm-table-ghost-btn-row": {
    position: "absolute",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    width: "20px",
    height: "20px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    border: "1px solid var(--sat-layout-border, rgba(255,255,255,0.15))",
    background: "var(--sat-surface-2, rgba(255,255,255,0.06))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    opacity: "0",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 150ms ease, background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    zIndex: "4",
  },
  ".cm-table-interactive:hover .cm-table-ghost-btn-row, .cm-table-interactive:focus-within .cm-table-ghost-btn-row": {
    opacity: "0.6",
    pointerEvents: "auto",
  },
  ".cm-table-ghost-btn-row:hover": {
    opacity: "1",
    background: "var(--sat-accent-primary, #60a5fa)",
    color: "var(--sat-surface-1, #0f172a)",
    borderColor: "var(--sat-accent-primary, #60a5fa)",
  },
  ".cm-table-ghost-label-row": {
    position: "absolute",
    left: "50%",
    bottom: "2px",
    transform: "translateX(-50%)",
    fontSize: "0.75rem",
    color: "var(--sat-text-muted, #94a3b8)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 120ms ease",
    textAlign: "center",
  },
  ".cm-table-ghost-label-row.visible": {
    opacity: "1",
  },
  ".cm-table-block th[contenteditable=\"plaintext-only\"]:focus, .cm-table-block td[contenteditable=\"plaintext-only\"]:focus, .cm-table-block th[contenteditable=\"true\"]:focus, .cm-table-block td[contenteditable=\"true\"]:focus": {
    outline: "2px solid var(--sat-accent-primary, #60a5fa)",
    outlineOffset: "-1px",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.04))",
    borderRadius: "2px",
  },
});

export const tableBlockSpec: BlockWidgetSpec<TableBlockModel> = {
  id: "table-block",
  matches,
  parse,
  render,
  span,
  theme: [TABLE_BLOCK_THEME, tableRawModeField],
};
