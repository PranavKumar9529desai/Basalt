import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

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
        navigator.clipboard.writeText(innerCode).then(() => {
          const originalHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Copied!`;
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
    const div = document.createElement("div");
    div.className = "cm-code-footer";
    return div;
  }
  ignoreEvent() {
    return true;
  }
}

export const CODE_BLOCKS_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-code": {
    backgroundColor: "var(--sat-editor-code-bg, #0a0f1a)",
  },
  ".cm-code-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "0",
    padding: "8px 12px 0 12px",
    backgroundColor: "var(--sat-editor-code-bg, #0a0f1a)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    userSelect: "none",
  },
  ".cm-code-lang-tag": {
    fontSize: "0.75rem",
    letterSpacing: "0.05em",
    color: "var(--sat-editor-code-muted, #64748b)",
    fontWeight: "600",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  ".cm-code-copy-btn": {
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
  ".cm-code-footer": {
    display: "block",
    backgroundColor: "var(--sat-editor-code-bg, #0a0f1a)",
    height: "8px",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },
});

// ---------------------------------------------------------------------------
// Node Handler (called during shared tree walk)
// ---------------------------------------------------------------------------

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

  // Record this range so other handlers can skip nodes inside code blocks
  ctx.codeBlockRanges.push({ from: node.from, to: node.to });

  const hasCursor = ctx.headPos >= node.from && ctx.headPos <= node.to;
  const doc = ctx.view.state.doc;
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);

  const startRenderLine = Math.max(
    startLine.number,
    doc.lineAt(rangeFrom).number,
  );
  const endRenderLine = Math.min(endLine.number, doc.lineAt(rangeTo).number);

  if (name === "FencedCode") {
    // Add line classes for code block background
    for (
      let lineNumber = startRenderLine;
      lineNumber <= endRenderLine;
      lineNumber += 1
    ) {
      if (
        !hasCursor &&
        (lineNumber === startLine.number || lineNumber === endLine.number)
      ) {
        continue; // Skip fence lines when cursor is outside (they become header/footer widgets)
      }
      const line = doc.line(lineNumber);
      collector.addLineClass(line.from, "cm-live-code");
    }

    // Add header/footer widget decorations when cursor is outside
    if (!hasCursor) {
      const langMatch = startLine.text.match(/^```([^\s]*)/);
      const lang = langMatch ? langMatch[1] : "";

      collector.addReplace(
        startLine.from,
        startLine.to,
        new CodeHeaderWidget(lang, node.from, node.to),
      );

      if (endLine.number > startLine.number) {
        collector.addReplace(endLine.from, endLine.to, new CodeFooterWidget());
      }
    }
  } else {
    // CodeBlock (indented code) — just line classes, no widgets
    for (
      let lineNumber = startRenderLine;
      lineNumber <= endRenderLine;
      lineNumber += 1
    ) {
      const line = doc.line(lineNumber);
      collector.addLineClass(line.from, "cm-live-code");
    }
  }

  return true; // Don't descend into code blocks
}
