import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

/** Count trailing spaces after a position on the same line (no sliceString calls). */
function skipTrailingSpaces(pos: number, state: EditorState): number {
  const line = state.doc.lineAt(pos);
  const rest = line.text.slice(pos - line.from);
  const spaces = rest.match(/^ +/);
  return pos + (spaces ? spaces[0].length : 0);
}

/** Lezer node types whose syntax markers should be hidden on non-active lines */
export const HIDE_MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "WikiLinkMark",
  "HighlightMark",
  "StrikethroughMark",
]);

export const MARK_HIDING_THEME = EditorView.baseTheme({
  ".cm-live-hide": {
    display: "none",
  },
  ".cm-live-block-mark": {
    color: "#94a3b8",
  },
  ".cm-live-inline-mark": {
    color: "#94a3b8",
  },
});

/**
 * Handles WYSIWYM mark hiding — hides syntax markers (like #, >, **, etc.)
 * when the cursor is NOT on that line. Shows them when the cursor IS on the line.
 *
 * Special handling for HeaderMark and QuoteMark: also hides the trailing space
 * after the marker character.
 *
 * Returns true if the node was handled.
 */
export function handleMarkHidingNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  const name = node.type.name;
  if (!HIDE_MARKS.has(name)) return false;

  // Check if this node is on the active (focused) line
  const onActiveLine = ctx.activeLine
    ? node.from >= ctx.activeLine.from && node.to <= ctx.activeLine.to
    : false;

  if (onActiveLine) {
    // Style marks as muted rather than hiding them
    if (name === "HeaderMark" || name === "QuoteMark") {
      const markTo = skipTrailingSpaces(node.to, ctx.state);
      collector.addMark(node.from, markTo, "cm-live-block-mark");
    } else {
      collector.addMark(node.from, node.to, "cm-live-inline-mark");
    }
    return true;
  }

  const hideFrom = node.from;
  let hideTo = node.to;

  // For HeaderMark (#) and QuoteMark (>), also hide the trailing space
  if (name === "HeaderMark" || name === "QuoteMark") {
    hideTo = skipTrailingSpaces(node.to, ctx.state);
  }

  collector.addMark(hideFrom, hideTo, "cm-live-hide");
  return true;
}
