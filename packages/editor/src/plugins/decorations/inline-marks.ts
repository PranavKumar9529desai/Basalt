import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector } from "./types";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const INLINE_MARKS_THEME = EditorView.baseTheme({
    ".cm-live-inline-code": {
        fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        backgroundColor: "#111827",
        borderRadius: "4px",
        padding: "0.1rem 0.3rem",
    },
    ".cm-live-wikilink": {
        color: "#a78bfa",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationColor: "transparent",
        transition: "text-decoration-color 0.2s ease",
    },
    ".cm-live-wikilink:hover": {
        textDecorationColor: "#a78bfa",
    },
});

// ---------------------------------------------------------------------------
// Node Handler
// ---------------------------------------------------------------------------

/**
 * Handles InlineCode and WikiLink nodes — adds mark decorations for styling.
 * Returns true if the node was handled.
 */
export function handleInlineNode(
    node: SyntaxNodeRef,
    collector: DecorationCollector,
): boolean {
    const name = node.type.name;

    if (name === "InlineCode") {
        collector.addMark(node.from, node.to, "cm-live-inline-code");
        return true;
    }

    if (name === "WikiLink") {
        collector.addMark(node.from, node.to, "cm-live-wikilink");
        return true;
    }

    return false;
}
