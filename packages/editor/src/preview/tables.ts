import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";
import { isTableInRawMode, setTableRawMode } from "../block-widgets/table-state";

export class RawTableToggleWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "cm-raw-table-toggle-btn";
    btn.type = "button";
    btn.title = "View as rendered table";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Render table</span>`;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: setTableRawMode.of(null) });
      view.focus();
    });
    return btn;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export const TABLES_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-table": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "0.9em",
  },
  ".cm-line.cm-live-table-header": {
    fontWeight: "700",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
    color: "var(--sat-table-header-color, #e2e8f0)",
  },
  ".cm-line.cm-live-table-delimiter": {
    color: "var(--sat-table-border, #334155)",
    opacity: "0.5",
  },
  ".cm-raw-table-toggle-btn": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    marginLeft: "1rem",
    padding: "2px 8px",
    fontSize: "0.75rem",
    lineHeight: "1.4",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.06))",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.1))",
    color: "var(--sat-accent-primary, #60a5fa)",
    cursor: "pointer",
    verticalAlign: "middle",
    userSelect: "none",
  },
  ".cm-raw-table-toggle-btn:hover": {
    background: "var(--sat-surface-3, rgba(255, 255, 255, 0.12))",
  },
});

/**
 * Handles Table nodes — adds line classes for header, delimiter, and body rows.
 * Returns true if the node was a Table (caller should return false to skip descent).
 */
export function handleTableNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "Table") return false;

  const doc = ctx.state.doc;
  const inRawMode = isTableInRawMode(ctx.state, node.from, node.to);
  let rowIndex = 0;

  let child = node.node.firstChild;
  while (child) {
    const line = doc.lineAt(child.from);

    if (child.name === "TableRow") {
      collector.addLineClass(line.from, "cm-live-table");
      if (rowIndex === 0) {
        collector.addLineClass(line.from, "cm-live-table-header");
        if (inRawMode && collector.addPoint) {
          collector.addPoint(line.to, new RawTableToggleWidget());
        }
      }
      rowIndex++;
    } else if (child.name === "TableDelimiter") {
      collector.addLineClass(line.from, "cm-live-table");
      collector.addLineClass(line.from, "cm-live-table-delimiter");
    }

    child = child.nextSibling;
  }

  return true;
}
