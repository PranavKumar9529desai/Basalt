import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";
import { renderModeFacet } from "./render-mode";

export class CodeHeaderWidget extends WidgetType {
  constructor(
    private readonly lang: string,
    private readonly codeFrom: number,
    private readonly codeTo: number,
  ) {
    super();
  }

  eq(other: CodeHeaderWidget) {
    return (
      other.lang === this.lang &&
      other.codeFrom === this.codeFrom &&
      other.codeTo === this.codeTo
    );
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-code-header";

    const langSpan = document.createElement("span");
    langSpan.className = "cm-code-lang-tag";
    langSpan.textContent = this.lang;
    container.appendChild(langSpan);

    const copyBtn = document.createElement("button");
    copyBtn.className = "cm-code-copy-btn";
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`;

    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const fullText = view.state.doc.sliceString(this.codeFrom, this.codeTo);
      const lines = fullText.split("\n");
      if (lines.length >= 2) {
        const innerCode = lines.slice(1, -1).join("\n");
        navigator.clipboard
          .writeText(innerCode)
          .then(() => {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
            }, 2000);
          })
          .catch(() => {
            // Clipboard write failed (permissions, HTTPS, or Tauri policy).
            // Fallback: restore original button and briefly show a fallback indicator.
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Failed`;
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
            }, 2000);
          });
      }
    });

    container.contentEditable = "false";
    container.appendChild(copyBtn);
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

export class CodeFooterWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    // The end strip's fixed height comes from `.cm-live-code-end`, not this
    // widget — this node only hides the closing fence text when the chrome is
    // shown, so it contributes no height of its own.
    const div = document.createElement("div");
    div.className = "cm-code-footer";
    div.setAttribute("aria-hidden", "true");
    return div;
  }
  ignoreEvent() {
    return true;
  }
}

export const CODE_BLOCKS_THEME = EditorView.baseTheme({
  // Obsidian-style invariant-height box: the whole block background is painted
  // with per-line begin/mid/end classes that are present in BOTH caret states,
  // and the begin/end lines are pinned to a fixed strip height. The header and
  // footer chrome is absolutely positioned so it never consumes line height.
  // Together this makes the block's total height identical whether the caret is
  // inside (raw source) or outside (chrome) — no layout jump on reveal.
  ".cm-line.cm-live-code, .cm-line.cm-live-code-begin, .cm-line.cm-live-code-end":
    {
      backgroundColor: "var(--sat-editor-code-bg, #0a0f1a)",
    },
  // End (bottom) strip: rounded bottom corners. No fixed height — this line is
  // a normal line in both caret states (raw closing fence when editing, empty
  // footer widget when the chrome is shown), so its height is already invariant.
  // Declared BEFORE begin so a single-line block (which carries both begin and
  // end) resolves its height from the begin rule below.
  ".cm-line.cm-live-code-end": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },
  // Begin (top) strip: fixed height so the code block's top edge is invariant
  // whether the caret is inside (raw fence sits in the reserved strip) or
  // outside (header bar overlays it). This is what prevents the height jump.
  ".cm-line.cm-live-code-begin": {
    position: "relative",
    height: "var(--sat-editor-code-strip, 2.25em)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },
  ".cm-code-header": {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "2px 12px 0 12px",
    backgroundColor: "var(--sat-editor-code-bg, #0a0f1a)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    userSelect: "none",
    pointerEvents: "none",
  },
  ".cm-code-copy-btn": {
    pointerEvents: "auto",
    background: "transparent",
    border: "none",
    color: "var(--sat-editor-code-muted, #64748b)",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "0.75em",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.2s",
  },
  ".cm-code-copy-btn:hover": {
    backgroundColor: "var(--sat-editor-code-hover-bg, #1e293b)",
    color: "var(--sat-editor-code-hover-text, #cbd5e1)",
  },
  ".cm-code-lang-tag": {
    fontSize: "0.75rem",
    letterSpacing: "0.05em",
    color: "var(--sat-editor-code-muted, #64748b)",
    fontWeight: "600",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * Paint the code-block background across a line range using Obsidian-style
 * begin/mid/end line classes. Every line carries the base `cm-live-code` (so
 * syntax highlighting keeps matching); the first/last rendered lines additionally
 * carry `cm-live-code-begin` / `cm-live-code-end` (fixed strip + rounded corners).
 * These classes are present in BOTH caret states, so the block's height is
 * invariant to reveal.
 */
function addCodeLineClasses(
  startLineNumber: number,
  endLineNumber: number,
  doc: EditorState["doc"],
  collector: DecorationCollector,
): void {
  for (
    let lineNumber = startLineNumber;
    lineNumber <= endLineNumber;
    lineNumber += 1
  ) {
    const isFirst = lineNumber === startLineNumber;
    const isLast = lineNumber === endLineNumber;
    // Every line keeps the base `cm-live-code` class so syntax-highlighting
    // selectors (`.cm-line.cm-live-code …`) and the shared background keep
    // matching. The first/last lines additionally carry the begin/end modifier
    // whose more-specific, later-declared rules apply the fixed strip + corners.
    const className = isFirst && isLast
      ? "cm-live-code cm-live-code-begin cm-live-code-end"
      : isFirst
        ? "cm-live-code cm-live-code-begin"
        : isLast
          ? "cm-live-code cm-live-code-end"
          : "cm-live-code";
    const line = doc.line(lineNumber);
    collector.addLineClass(line.from, className);
  }
}

/**
 * Handles FencedCode and CodeBlock nodes:
 * - Records code block ranges in context (for other handlers to check)
 * - Adds cm-live-code line classes for background styling
 * - Adds header/footer widget decorations when cursor is outside the block
 *
 * Returns true if the node was a code block (caller should NOT descend).
 */
export function handleCodeBlockNode(
  node: SyntaxNodeRef,
  rangeFrom: number,
  rangeTo: number,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  const name = node.type.name;
  if (name !== "FencedCode" && name !== "CodeBlock") return false;

  const doc = ctx.state.doc;
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);

  const startRenderLine = Math.max(
    startLine.number,
    doc.lineAt(rangeFrom).number,
  );
  const endRenderLine = Math.min(endLine.number, doc.lineAt(rangeTo).number);

  // DQL/dataview blocks: add the code-block background line classes, but leave
  // widget dispatch and child-skipping to the dql block widget (live-preview).
  // Return false so handleBlockWidgetsNode dispatches them.
  if (name === "FencedCode") {
    const langMatch = startLine.text.match(/^```([^\s]*)/);
    const lang = langMatch ? langMatch[1].toLowerCase() : "";
    if (lang === "dql" || lang === "dataview") {
      addCodeLineClasses(startRenderLine, endRenderLine, doc, collector);
      return false;
    }
  }

  // Record this range so other handlers can skip nodes inside code blocks
  ctx.codeBlockRanges.push({ from: node.from, to: node.to });

  // Reading mode always renders the header/footer chrome — the caret must not
  // collapse the block to raw source (see render-mode.ts).
  const hasCursor =
    ctx.state.facet(renderModeFacet) === "live" &&
    ctx.headPos >= node.from &&
    ctx.headPos <= node.to;

  // Add line classes for code block background
  addCodeLineClasses(startRenderLine, endRenderLine, doc, collector);

  if (name === "FencedCode") {
    // Add header/footer widget decorations when cursor is outside
    if (!hasCursor) {
      const lang = startLine.text.match(/^```([^\s]*)/)?.[1] ?? "";

      collector.addReplace(
        startLine.from,
        startLine.to,
        new CodeHeaderWidget(lang, node.from, node.to),
      );

      if (endLine.number > startLine.number) {
        collector.addReplace(endLine.from, endLine.to, new CodeFooterWidget());
      }
    }
  }

  return true; // Don't descend into code blocks
}
