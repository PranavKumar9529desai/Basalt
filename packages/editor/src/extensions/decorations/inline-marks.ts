import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector } from "./types";

export const INLINE_MARKS_THEME = EditorView.baseTheme({
  ".cm-live-inline-code": {
    fontFamily: "var(--sat-font-mono)",
    backgroundColor: "var(--sat-editor-inline-bg, #111827)",
    borderRadius: "4px",
    padding: "0.1rem 0.3rem",
  },
  ".cm-live-wikilink": {
    color: "var(--sat-editor-accent, #a78bfa)",
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationColor: "transparent",
    transition: "text-decoration-color 0.2s ease",
  },
  ".cm-live-wikilink:hover": {
    textDecorationColor: "var(--sat-editor-accent, #a78bfa)",
  },
  ".cm-live-highlight": {
    backgroundColor: "var(--sat-highlight-bg, rgba(234,179,8,0.25))",
    color: "var(--sat-highlight-color, inherit)",
    borderRadius: "2px",
    padding: "0 0.1rem",
  },
  ".cm-live-strikethrough": {
    textDecoration: "line-through",
    opacity: "0.6",
  },
  ".cm-live-tag": {
    display: "inline-block",
    backgroundColor: "var(--sat-tag-bg, rgba(99,102,241,0.15))",
    color: "var(--sat-tag-color, #818cf8)",
    borderRadius: "9999px",
    padding: "0.15rem 0.65rem",
    fontSize: "0.8em",
    fontWeight: "500",
    lineHeight: "1.4",
  },
  ".cm-live-strong": {
    fontWeight: "700",
  },
  ".cm-live-em": {
    fontStyle: "italic",
  },
});

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

  if (name === "Highlight") {
    collector.addMark(node.from, node.to, "cm-live-highlight");
    return true;
  }

  if (name === "Strikethrough") {
    collector.addMark(node.from, node.to, "cm-live-strikethrough");
    return true;
  }

  if (name === "StrongEmphasis") {
    collector.addMark(node.from, node.to, "cm-live-strong");
    return false; // descend so EmphasisMark children get hidden
  }

  if (name === "Emphasis") {
    collector.addMark(node.from, node.to, "cm-live-em");
    return false; // descend so EmphasisMark children get hidden
  }

  return false;
}

const TAG_RE = /#([a-zA-Z][a-zA-Z0-9/_-]*)/g;

/**
 * Scans a single line for #tags and adds cm-live-tag marks.
 * Skips matches inside code blocks. Call from the ViewPlugin pass.
 */
export function handleTagsInLine(
  lineFrom: number,
  lineText: string,
  codeBlockRanges: { from: number; to: number }[],
  collector: DecorationCollector,
): void {
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(lineText)) !== null) {
    const from = lineFrom + match.index;
    const to = from + match[0].length;

    const inCode = codeBlockRanges.some((r) => from >= r.from && to <= r.to);
    if (inCode) continue;

    // Must be preceded by whitespace or start of line
    if (match.index > 0 && !/\s/.test(lineText[match.index - 1])) continue;

    collector.addMark(from, to, "cm-live-tag");
  }
}
