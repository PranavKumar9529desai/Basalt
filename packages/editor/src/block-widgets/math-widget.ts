import type { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import type {
  DecorationCollector,
  DecorationContext,
} from "../preview/types";

// ---------------------------------------------------------------------------
// KaTeX CSS injection (once per session)
// ---------------------------------------------------------------------------

let katexCssInjected = false;

/**
 * Inject KaTeX's CSS into document.head once.
 * Must be called before the first katex.renderToString() invocation.
 * KaTeX renders correctly without its CSS in simple cases, but fonts and
 * spacing are wrong without it.
 */
function ensureKatexCss(): void {
  if (katexCssInjected || typeof document === "undefined") return;
  katexCssInjected = true;
  if (document.querySelector("[data-katex-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute("data-katex-css", "");
  // Vite resolves this ?url import to the katex dist asset path at build time.
  // At runtime this becomes a chunk-relative URL.
  link.href = new URL("katex/dist/katex.min.css", import.meta.url).href;
  document.head.appendChild(link);
}

// ---------------------------------------------------------------------------
// Module-level caches (content-keyed)
// ---------------------------------------------------------------------------

/** Block math HTML cache. Key = latex source string. */
const mathBlockCache = new Map<string, string>();

/** Inline math HTML cache. Key = latex source string. */
const mathInlineCache = new Map<string, string>();

/** Exported so apps/tauri can clear on vault reload or theme change. */
export function clearMathCache(): void {
  mathBlockCache.clear();
  mathInlineCache.clear();
}

// ---------------------------------------------------------------------------
// Block math widget ($$...$$)
// ---------------------------------------------------------------------------

class MathBlockWidget extends WidgetType {
  constructor(private readonly latex: string) {
    super();
  }

  /** CM6 calls eq() before toDOM() — if true, existing DOM node is reused. */
  eq(other: MathBlockWidget): boolean {
    return this.latex === other.latex;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-math-block";

    // Synchronous fast path from cache
    const cached = mathBlockCache.get(this.latex);
    if (cached) {
      container.innerHTML = cached;
      return container;
    }

    // Async first-load: show placeholder, then render
    container.innerHTML = '<span class="cm-math-loading">…</span>';

    const latex = this.latex;
    import("katex").then(({ default: katex }) => {
      if (!container.isConnected) return;
      ensureKatexCss();
      try {
        const html = katex.renderToString(latex, {
          displayMode: true,       // block / display math
          throwOnError: false,     // render partial output; mark errors inline
          output: "html",          // HTML+CSS, not MathML — consistent cross-browser
          // Strict: false allows unknown macros to render as their name
          // rather than throwing. Matches Obsidian's behavior.
          strict: "ignore",
        });
        mathBlockCache.set(latex, html);
        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = `<span class="cm-math-error">${String(err)}</span>`;
      }
    });

    return container;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Block math BlockWidgetSpec
// ---------------------------------------------------------------------------

interface MathBlockModel {
  /** LaTeX between the $$ delimiters, trimmed. */
  latex: string;
  from: number;
  to: number;
  inCursor: boolean;
}

const matchesMathBlock = (node: SyntaxNodeRef): boolean =>
  node.type.name === "BlockMath";

const parseMathBlock = (
  state: EditorState,
  node: SyntaxNodeRef,
): MathBlockModel | null => {
  if (node.type.name !== "BlockMath") return null;

  // BlockMath node spans from the opening $$ to the closing $$.
  // Strip the delimiters and whitespace to get the latex content.
  const raw = state.doc.sliceString(node.from, node.to);
  const latex = raw
    .replace(/^\$\$\s*/, "")
    .replace(/\s*\$\$$/, "")
    .trim();
  if (!latex) return null;

  const headPos = state.selection.main.head;
  const inCursor =
    state.facet(renderModeFacet) === "live" &&
    headPos >= node.from &&
    headPos <= node.to;

  return { latex, from: node.from, to: node.to, inCursor };
};

const spanMathBlock = (
  model: MathBlockModel,
): { from: number; to: number } | null => {
  if (model.inCursor) return null;
  return { from: model.from, to: model.to };
};

const renderMathBlock = (
  model: MathBlockModel,
): MathBlockWidget | null => {
  if (model.inCursor) return null;
  return new MathBlockWidget(model.latex);
};

export const mathBlockSpec: BlockWidgetSpec<MathBlockModel> = {
  id: "math-block",
  matches: matchesMathBlock,
  parse: parseMathBlock,
  span: spanMathBlock,
  render: renderMathBlock,
};

// ---------------------------------------------------------------------------
// Inline math widget ($...$)
// ---------------------------------------------------------------------------

export class MathInlineWidget extends WidgetType {
  constructor(private readonly latex: string) {
    super();
  }

  eq(other: MathInlineWidget): boolean {
    return this.latex === other.latex;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-math-inline";

    // Synchronous fast path
    const cached = mathInlineCache.get(this.latex);
    if (cached) {
      span.innerHTML = cached;
      return span;
    }

    // After the first `import('katex')` the module is cached in the JS module
    // registry — subsequent calls resolve synchronously without a network fetch.
    const latex = this.latex;
    import("katex").then(({ default: katex }) => {
      if (!span.isConnected) return;
      ensureKatexCss();
      try {
        const html = katex.renderToString(latex, {
          displayMode: false,   // inline math
          throwOnError: false,
          output: "html",
          strict: "ignore",
        });
        mathInlineCache.set(latex, html);
        span.innerHTML = html;
      } catch {
        // Fallback: show raw source in error style
        span.innerHTML = `<span class="cm-math-error">\$${escapeHtml(latex)}\$</span>`;
      }
    });

    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Inline math handler for the collector tree walk
// ---------------------------------------------------------------------------

/**
 * Called from collector.ts's single tree walk alongside handleInlineNode().
 * Detects InlineMath nodes produced by our mathMarkdownExtension grammar.
 *
 * When the cursor is NOT on the same line as the expression, replaces the
 * full $...$ range (including delimiters) with a rendered MathInlineWidget.
 * When the cursor IS on the line, returns false — raw source stays visible.
 *
 * The isInCodeBlock guard in the tree walk runs before this function is called,
 * so we will never fire inside a FencedCode block.
 */
export function handleInlineMathNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "InlineMath") return false;

  // Extract latex content: InlineMath node includes the $ delimiters.
  // Slice the full range and strip the outer $ characters.
  const raw = ctx.state.doc.sliceString(node.from, node.to);
  // raw is "$latex$" — strip leading and trailing $
  if (raw.length < 3) return false; // minimum: "$x$"
  const latex = raw.slice(1, -1).trim();
  if (!latex) return false;

  // Cursor-aware reveal:
  // - In live mode: if the cursor is on the same line, show raw source.
  // - In reading mode: ctx.activeLine is null → always render.
  if (ctx.activeLine !== null) {
    const nodeLine = ctx.state.doc.lineAt(node.from).number;
    if (ctx.activeLine.number === nodeLine) return false;
  }

  // Emit a non-block replace decoration (block:false is default).
  // This swaps the $...$ character range for the rendered MathInlineWidget.
  collector.addReplace(node.from, node.to, new MathInlineWidget(latex));
  return true;
}
