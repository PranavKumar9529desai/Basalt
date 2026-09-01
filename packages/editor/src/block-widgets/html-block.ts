import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { sanitizeHtml } from "../preview/html-sanitize";
import { HTML_TYPOGRAPHY_CSS } from "../preview/html-typography";

let typographyInjected = false;
// The shared .sat-html typography stylesheet is scoped to the container class,
// so a single document-head <style> can't leak. Injected once; idempotent (Reading
// may have already injected it). This is the same source Reading uses, keeping
// Live Preview and Reading in sync.
function ensureTypographyStyle(): void {
  if (typographyInjected || typeof document === "undefined") return;
  typographyInjected = true;
  if (document.querySelector("[data-sat-html-typography]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-sat-html-typography", "");
  style.textContent = HTML_TYPOGRAPHY_CSS;
  document.head.appendChild(style);
}

// A raw HTMLBlock node renders as sanitized rich HTML only when the caret is
// off the block; when the caret sits on the block, render() returns null so
// live-preview emits no replacement and the raw source stays editable/navigable
// (same conditional-replacement model as the horizontal-rule widget). Clicking
// a rendered block places the caret just inside it to flip back to raw source.
// Sanitization runs once per block via WidgetType.eq; toDOM is called lazily
// only for visible viewport widgets.

interface HtmlBlockModel {
  html: string;
  raw: string;
  active: boolean;
  from: number;
  to: number;
}

class HtmlBlockWidget extends WidgetType {
  constructor(private model: HtmlBlockModel) {
    super();
  }

  eq(other: HtmlBlockWidget): boolean {
    return this.model.html === other.model.html;
  }

  toDOM(view: EditorView): HTMLElement {
    ensureTypographyStyle();
    const container = document.createElement("div");
    container.className = "cm-live-html-block sat-html";
    // `model.html` is already DOMPurify-clean; insert as-is and never re-process
    // the innerHTML sink afterward.
    container.innerHTML = this.model.html;

    // Clicking a rendered block should let the user edit its source: place the
    // caret just inside the block, which flips `active` → raw source on the next
    // selection-driven rebuild.
    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        selection: { anchor: Math.min(this.model.from + 1, this.model.to) },
        scrollIntoView: true,
      });
      view.focus();
    });

    return container;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const matches = (node: SyntaxNodeRef): boolean => node.type.name === "HTMLBlock";

const parse = (state: EditorState, node: SyntaxNodeRef): HtmlBlockModel | null => {
  const raw = state.doc.sliceString(node.from, node.to);
  const html = sanitizeHtml(raw);
  const head = state.selection.main.head;
  // Obsidian-style per-block activation: the block shows raw source when the
  // caret's line falls anywhere within its first..last line.
  const headLine = state.doc.lineAt(head).number;
  const blockFromLine = state.doc.lineAt(node.from).number;
  const blockToLine = state.doc.lineAt(node.to).number;
  const active = headLine >= blockFromLine && headLine <= blockToLine;
  return { html, raw, active, from: node.from, to: node.to };
};

const span = (model: HtmlBlockModel): { from: number; to: number } => ({
  from: model.from,
  to: model.to,
});

const render = (
  model: HtmlBlockModel,
  _state: EditorState,
): HtmlBlockWidget | null => {
  // When the cursor is on the block, emit NO replacement → the raw HTML shows
  // and is directly editable/navigable (this fixes arrow-key skipping and
  // click-to-edit, matching the HR widget's conditional-replace pattern).
  if (model.active) return null;
  return new HtmlBlockWidget(model);
};

export const htmlBlockSpec: BlockWidgetSpec<HtmlBlockModel> = {
  id: "html-block",
  matches,
  parse,
  render,
  span,
};

/** Theme for the rendered HTML block. */
export const HTML_BLOCK_THEME = EditorView.baseTheme({
  ".cm-live-html-block": {
    border: "1px solid var(--sat-layout-divider, rgba(255,255,255,0.1))",
    borderRadius: "6px",
    padding: "0.75rem 1rem",
    margin: "0.5rem 0",
    background: "var(--sat-surface-2, rgba(255,255,255,0.03))",
    overflowX: "auto",
    boxSizing: "border-box",
    cursor: "text",
  },
});
