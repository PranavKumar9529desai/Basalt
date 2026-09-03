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

/** Add the shared code-block background line class across a line range. */
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
    const line = doc.line(lineNumber);
    collector.addLineClass(line.from, "cm-live-code");
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
