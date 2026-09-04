import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector } from "./types";
import { isInCodeBlock } from "./types";

/** Module-scoped regex; `matchAll` uses an internal copy so the `g` flag's
 * `lastIndex` is not shared across calls (no state leakage between lines). */
const TAG_RE = /#([a-zA-Z][a-zA-Z0-9/_-]*)/g;
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
  // Inline HTML tags stay visible, editable raw source; container-tag
  // render-reveal is deferred to avoid mXSS risk. A subtle mark sets them apart
  // without touching the document text.
  ".cm-live-html-tag": {
    color: "var(--sat-editor-accent, #a78bfa)",
    opacity: "0.85",
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

  // Inline HTML tags stay as visible, editable raw source (container-tag
  // render-reveal is deferred). A subtle mark makes them distinct without
  // touching the document text.
  if (name === "HTMLTag") {
    collector.addMark(node.from, node.to, "cm-live-html-tag");
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

const MAX_TAG_ITERATIONS = 1000;

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
  const matches = lineText.matchAll(TAG_RE);
  let iterations = 0;

  for (const match of matches) {
    if (++iterations > MAX_TAG_ITERATIONS) {
      console.warn(
        `[WATCHDOG] handleTagsInLine exceeded ${MAX_TAG_ITERATIONS} iterations on line: "${lineText.slice(0, 80)}"`,
      );
      break;
    }

    const from = lineFrom + match.index;
    const to = from + match[0].length;

    // Use binary-search-based isInCodeBlock (assumes ranges are sorted)
    if (isInCodeBlock(from, codeBlockRanges)) continue;

    // Must be preceded by whitespace or start of line
    if (match.index > 0 && !/\s/.test(lineText[match.index - 1])) continue;

    collector.addMark(from, to, "cm-live-tag");
  }
}
