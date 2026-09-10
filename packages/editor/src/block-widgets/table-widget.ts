import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import { resolveAssetFacet } from "../types";
import { isTableInRawMode, tableRawModeField } from "./table-state";
import {
  insertColumnRight,
  insertRowBelow,
  updateCellText,
} from "../input/table-mutations";
import { parseMarkdownTable, type TableBlockModel } from "./table-parse";
import type { ResolveAssetFn } from "./table-html";
import { TABLE_BLOCK_THEME } from "./table-theme";
import { buildTableElement, type TableRenderCallbacks } from "./table-render";
import { buildInteractiveChrome } from "./table-chrome";

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
//
// Split layout (ADR-038 §3): parsing → table-parse.ts, HTML → table-html.ts,
// theme → table-theme.ts, table DOM → table-render.ts, interactive chrome
// (code toggle, ghost col/row, zone tracking) → table-chrome.ts. This module
// owns the widget lifecycle: editing commits, pending-focus restore, and the
// BlockWidgetSpec.
// ---------------------------------------------------------------------------

// Re-exports from split modules (ADR-038 §3): the public surface of this module
// is unchanged — parsing lives in table-parse.ts, HTML building in table-html.ts,
// and the theme in table-theme.ts.
export type { TableBlockModel } from "./table-parse";
export { parseMarkdownTable } from "./table-parse";
export type { ResolveAssetFn } from "./table-html";
export { renderInlineCell } from "./table-html";
export { TABLE_BLOCK_THEME } from "./table-theme";

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
      changes: {
        from: this.model.from,
        to: this.model.to,
        insert: result.text,
      },
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
      changes: {
        from: this.model.from,
        to: this.model.to,
        insert: result.text,
      },
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
      changes: {
        from: this.model.from,
        to: this.model.to,
        insert: result.text,
      },
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
        ? (this.model.headers[colIdx] ?? "")
        : (this.model.body[rowIdx - 1]?.[colIdx] ?? "");
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
      changes: {
        from: this.model.from,
        to: this.model.to,
        insert: appendRes.text,
      },
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

    const cbs: TableRenderCallbacks = {
      commitCell: (row, col, text, nextFocus, w) =>
        this.commitCell(row, col, text, nextFocus, w),
      commitAndAppendRow: (row, col, text, targetCol) =>
        this.commitAndAppendRow(row, col, text, targetCol),
      focusCell: (root, row, col) => this.focusCell(root, row, col),
      onAddColumn: () => this.handleAddColumn(),
      onAddRow: () => this.handleAddRow(),
    };

    const { table, thead } = buildTableElement(
      this.model,
      this.resolve,
      view,
      wrapper,
      cbs,
    );

    const container = document.createElement("div");
    container.className = "cm-table-container";
    container.appendChild(table);

    // Live Preview interactive chrome
    if (this.model.isLive) {
      buildInteractiveChrome(this.model, view, container, table, thead, cbs);
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

export const tableBlockSpec: BlockWidgetSpec<TableBlockModel> = {
  id: "table-block",
  matches,
  parse,
  render,
  span,
  theme: [TABLE_BLOCK_THEME, tableRawModeField],
};
