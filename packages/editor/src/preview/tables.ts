import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

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
  let rowIndex = 0;

  let child = node.node.firstChild;
  while (child) {
    const line = doc.lineAt(child.from);

    if (child.name === "TableRow") {
      collector.addLineClass(line.from, "cm-live-table");
      if (rowIndex === 0) {
        collector.addLineClass(line.from, "cm-live-table-header");
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
