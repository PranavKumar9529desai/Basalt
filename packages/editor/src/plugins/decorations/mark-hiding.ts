import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationContext, DecorationCollector } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lezer node types whose syntax markers should be hidden on non-active lines */
export const HIDE_MARKS = new Set([
    "HeaderMark",
    "QuoteMark",
    "LinkMark",
    "EmphasisMark",
    "CodeMark",
    "WikiLinkMark",
]);

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const MARK_HIDING_THEME = EditorView.baseTheme({
    ".cm-live-hide": {
        display: "none",
    },
});

// ---------------------------------------------------------------------------
// Node Handler
// ---------------------------------------------------------------------------

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

    if (onActiveLine) return true; // Don't hide marks on the active line

    let hideFrom = node.from;
    let hideTo = node.to;

    // For HeaderMark (#) and QuoteMark (>), also hide the trailing space
    if (name === "HeaderMark" || name === "QuoteMark") {
        const docLength = ctx.view.state.doc.length;
        while (hideTo < docLength) {
            const nextChar = ctx.view.state.doc.sliceString(hideTo, hideTo + 1);
            if (nextChar === " ") {
                hideTo += 1;
            } else {
                break;
            }
        }
    }

    collector.addMark(hideFrom, hideTo, "cm-live-hide");
    return true;
}
