import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

export const BLOCKQUOTES_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-blockquote": {
    borderLeft: "3px solid var(--sat-editor-blockquote-border, #334155)",
    paddingLeft: "0.9rem",
    color: "var(--sat-editor-blockquote-text, #cbd5f5)",
  },
});

/**
 * Handles BlockQuote nodes — adds line-level blockquote classes.
 * Returns true if the node was handled.
 */
export function handleBlockquoteNode(
  node: SyntaxNodeRef,
  rangeFrom: number,
  rangeTo: number,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "BlockQuote") return false;

  const doc = ctx.view.state.doc;
  const startLine = doc.lineAt(Math.max(node.from, rangeFrom));
  const endLine = doc.lineAt(Math.min(node.to, rangeTo));

  for (
    let lineNumber = startLine.number;
    lineNumber <= endLine.number;
    lineNumber += 1
  ) {
    const line = doc.line(lineNumber);
    collector.addLineClass(line.from, "cm-live-blockquote");
  }

  return true;
}
