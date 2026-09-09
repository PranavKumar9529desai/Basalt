import { Facet, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet, type RenderMode } from "../preview/render-mode";
import { createCodeToggleButton } from "./code-toggle-button";
import { notifyViewOfSizeChange } from "./utils";

// ---------------------------------------------------------------------------
// Mermaid theme facet — injected so the widget can re-initialize on theme
// change without a hard-coded theme. Defaults to "dark".
// ---------------------------------------------------------------------------

export const mermaidThemeFacet = Facet.define<string, string>({
  combine: (values) => values[0] ?? "dark",
});

// ---------------------------------------------------------------------------
// Module-level SVG cache (content-keyed)
// ---------------------------------------------------------------------------

/** SVG output cache. Key = diagram source text. Shared across all widget
 *  instances so a diagram that appears twice in a note is rendered once. */
const svgCache = new Map<string, string>();

/** Exported so apps/tauri can clear on theme change or vault reload. */
export function clearMermaidCache(): void {
  svgCache.clear();
  // Reset init guard so next render picks up any new theme setting.
  mermaidInitialized = false;
}

let mermaidInitialized = false;

// ---------------------------------------------------------------------------
// Stable ID helper
// ---------------------------------------------------------------------------

/** Short, CSS-safe, stable ID derived from diagram source text.
 *  mermaid.render() needs a unique element id per invocation — using a stable
 *  hash avoids accumulating orphaned #d{n} elements in the document. */
function stableId(text: string): string {
  return btoa(encodeURIComponent(text))
    .slice(0, 12)
    .replace(/[^a-zA-Z0-9]/g, "x");
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class MermaidWidget extends WidgetType {
  constructor(
    private readonly diagramText: string,
    private readonly from: number,
    private readonly renderMode: RenderMode,
    private readonly theme: string,
  ) {
    super();
  }

  /** CM6 calls eq() before toDOM() — if true, existing DOM node is reused. */
  eq(other: MermaidWidget): boolean {
    return this.diagramText === other.diagramText && this.theme === other.theme;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-mermaid-container";

    // Code-toggle button (same UX as DQL): click to navigate caret into the
    // raw source block so the user can edit it. Only in live preview mode.
    if (this.renderMode === "live") {
      const codeBtn = createCodeToggleButton(view, (v) => {
        v.dispatch({ selection: { anchor: this.from } });
      });
      container.appendChild(codeBtn);
    }

    // --- Synchronous fast path: serve cached SVG ---
    const cacheKey = `${this.theme}:${this.diagramText}`;
    const cached = svgCache.get(cacheKey);
    if (cached) {
      const svgWrapper = document.createElement("div");
      svgWrapper.className = "cm-mermaid-svg";
      svgWrapper.innerHTML = cached;
      container.appendChild(svgWrapper);
      return container;
    }

    // --- Async first-render path ---
    const placeholder = document.createElement("div");
    placeholder.className = "cm-mermaid-loading";
    placeholder.textContent = "Rendering diagram…";
    container.appendChild(placeholder);

    this.renderAsync(container, placeholder, view, cacheKey);
    return container;
  }

  private async renderAsync(
    container: HTMLElement,
    placeholder: HTMLElement,
    view: EditorView,
    cacheKey: string,
  ): Promise<void> {
    try {
      const { default: mermaid } = await import("mermaid");

      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          // 🔒 SECURITY: 'strict' disables %%{init}%% config override directives,
          // click handlers, javascript: URIs, and HTML labels. Mermaid internally
          // runs DOMPurify on its output at this level. Never set to 'loose'.
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: this.theme as
            | "dark"
            | "default"
            | "base"
            | "forest"
            | "neutral",
        });
        mermaidInitialized = true;
      }

      // mermaid.render() requires a unique element ID per invocation.
      const id = `cm-mermaid-${stableId(this.diagramText)}`;
      const { svg } = await mermaid.render(id, this.diagramText);

      // Guard: if this widget was removed from the DOM while the async render
      // was in flight (user typed, cursor moved into the block), bail silently.
      if (!container.isConnected) return;

      svgCache.set(cacheKey, svg);

      placeholder.remove();
      const svgWrapper = document.createElement("div");
      svgWrapper.className = "cm-mermaid-svg";
      svgWrapper.innerHTML = svg;
      container.appendChild(svgWrapper);

      // Notify CM6 that this widget's height changed so the layout engine
      // can reflow the document around the newly rendered SVG.
      notifyViewOfSizeChange(container, view);
    } catch (err) {
      // Clean up any stray error elements Mermaid may have injected into document.body
      if (typeof document !== "undefined") {
        const stray = document.querySelectorAll(
          `[id^="dcm-mermaid-"], [id^="cm-mermaid-"].error-icon, .mermaid-error`,
        );
        stray.forEach((el) => el.remove());
      }

      if (!container.isConnected) return;
      placeholder.remove();
      const errDiv = document.createElement("div");
      errDiv.className = "cm-mermaid-error";
      errDiv.textContent = `Diagram error: ${String(err)}`;
      container.appendChild(errDiv);
      notifyViewOfSizeChange(container, view);
    }
  }

  /** SVG diagrams are not interactive — let CM6 handle all pointer events. */
  ignoreEvent(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// BlockWidgetSpec model
// ---------------------------------------------------------------------------

interface MermaidModel {
  /** Diagram source text — everything between the fences, trimmed. */
  diagramText: string;
  /** Character position of the opening fence line start. */
  from: number;
  /** Character position of the closing fence line end. */
  to: number;
  /** True when the caret is inside the block in live mode. No replace emitted. */
  inCursor: boolean;
  /** Mermaid theme string from the facet. */
  theme: string;
}

const MERMAID_LANGUAGES = new Set(["mermaid"]);

const matches = (node: SyntaxNodeRef): boolean =>
  node.type.name === "FencedCode";

const parse = (
  state: EditorState,
  node: SyntaxNodeRef,
): MermaidModel | null => {
  if (node.type.name !== "FencedCode") return null;

  const doc = state.doc;
  const startLine = doc.lineAt(node.from);
  const langMatch = startLine.text.match(/^```([^\s]*)/);
  const lang = langMatch ? langMatch[1].toLowerCase() : "";
  if (!MERMAID_LANGUAGES.has(lang)) return null;

  const endLine = doc.lineAt(node.to);
  const bodyStart = startLine.to + 1;
  const bodyEnd = endLine.from;
  const diagramText =
    bodyStart < bodyEnd ? doc.sliceString(bodyStart, bodyEnd).trim() : "";
  if (!diagramText) return null;

  const headPos = state.selection.main.head;
  // In reading mode renderModeFacet === "reading"; caret must not collapse
  // the block to raw source in reading mode (same contract as DQL widget).
  const inCursor =
    state.facet(renderModeFacet) === "live" &&
    headPos >= node.from &&
    headPos <= node.to;

  const theme = state.facet(mermaidThemeFacet);
  return { diagramText, from: node.from, to: endLine.to, inCursor, theme };
};

const span = (model: MermaidModel): { from: number; to: number } | null => {
  // When cursor is inside the block, emit NO replacement so raw source is
  // directly editable/navigable (same pattern as html-block.ts).
  if (model.inCursor) return null;
  return { from: model.from, to: model.to };
};

const renderWidget = (
  model: MermaidModel,
  state: EditorState,
): MermaidWidget | null => {
  if (model.inCursor) return null;
  return new MermaidWidget(
    model.diagramText,
    model.from,
    state.facet(renderModeFacet),
    model.theme,
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const mermaidBlockSpec: BlockWidgetSpec<MermaidModel> = {
  id: "mermaid",
  matches,
  parse,
  span,
  render: renderWidget,
};

/** Default theme facet value — "dark" matches Basalt's default dark theme. */
export const defaultMermaidTheme: Extension = mermaidThemeFacet.of("dark");
