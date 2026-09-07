import { Facet, type EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { BlockWidgetSpec } from "./registry";
import { renderModeFacet } from "../preview/render-mode";
import { createCodeToggleButton } from "./code-toggle-button";
import { escapeHtml, notifyViewOfSizeChange } from "./utils";
import { renderDqlResult } from "./dql-html";
export type {
  TypedValue,
  QueryColumn,
  QueryResult,
  RunQueryFn,
  OpenLinkFn,
} from "./dql-types";
import type { QueryResult, RunQueryFn, OpenLinkFn } from "./dql-types";
export { DQL_WIDGET_THEME } from "./dql-theme";

// ---------------------------------------------------------------------------
// Dependency facet — injected by the feature layer so this package stays pure
// (ADR-022 rule 2 / ADR-007: no Tauri, no IPC in packages/ui).
// ---------------------------------------------------------------------------

export const runQueryFacet = Facet.define<
  RunQueryFn | undefined,
  RunQueryFn | undefined
>({
  combine: (values) => values[0],
});

export const openLinkFacet = Facet.define<
  OpenLinkFn | undefined,
  OpenLinkFn | undefined
>({
  combine: (values) => values[0],
});

// ---------------------------------------------------------------------------
// Result cache — keyed by query text. Cleared when vault reindexes.
// Lives at module scope; each widget's toDOM checks before fetching.
// ---------------------------------------------------------------------------

const queryCache = new Map<string, QueryResult>();

export function clearQueryCache(): void {
  queryCache.clear();
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

interface DqlModel {
  queryText: string;
  /** Character offsets within the doc (for replace decorations). */
  from: number;
  to: number;
}

export class DqlResultWidget extends WidgetType {
  constructor(
    private readonly queryText: string,
    private readonly runQuery: RunQueryFn | undefined,
    private readonly onOpenLink: OpenLinkFn | undefined,
    private readonly from?: number,
    private readonly to?: number,
  ) {
    super();
  }

  eq(other: DqlResultWidget): boolean {
    return (
      this.queryText === other.queryText &&
      this.from === other.from &&
      this.to === other.to
    );
  }
  /** Attach a delegated click handler so result links open notes via onOpenLink. */
  private bindLinks(div: HTMLElement): void {
    const onOpenLink = this.onOpenLink;
    if (!onOpenLink) return;
    div.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a.internal-link");
      if (!anchor) return;
      event.preventDefault();
      const name = anchor.getAttribute("data-name") ?? anchor.textContent ?? "";
      if (name) onOpenLink(name.trim());
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-dql-result";

    if (this.from !== undefined) {
      const codeBtn = createCodeToggleButton(view, (v) => {
        v.dispatch({
          selection: { anchor: this.from! },
        });
      });
      div.appendChild(codeBtn);
    }

    // Synchronous fast path: render from cache
    const cached = queryCache.get(this.queryText);
    if (cached) {
      const content = document.createElement("div");
      content.innerHTML = renderDqlResult(cached);
      div.appendChild(content);
      this.bindLinks(div);
      return div;
    }

    // Async path: show loading, fetch in background
    const content = document.createElement("div");
    content.innerHTML = '<div class="cm-dql-loading">Loading query…</div>';
    div.appendChild(content);
    this.bindLinks(div);

    if (this.runQuery) {
      const queryText = this.queryText;
      this.runQuery(queryText)
        .then((result) => {
          queryCache.set(queryText, result);
          if (!div.isConnected || this.queryText !== queryText) return;
          content.innerHTML = renderDqlResult(result);
          this.bindLinks(div);
          notifyViewOfSizeChange(div, view);
        })
        .catch((err) => {
          if (!div.isConnected || this.queryText !== queryText) return;
          content.innerHTML = `<div class="cm-dql-error">Query error: ${escapeHtml(String(err))}</div>`;
          notifyViewOfSizeChange(div, view);
        });
    } else {
      content.innerHTML =
        '<div class="cm-dql-error">Query engine not available</div>';
    }

    return div;
  }

  ignoreEvent() {
    return false; // allow clicks on links
  }
}

// ---------------------------------------------------------------------------
// Note on CM block-widget layout: multi-line block widgets must use
// `block: true` (registry.ts), so CM draws them *between* lines in their own
// block slot. Vertical PADDING on the container is fine (it's inside the box
// and measured), but block widgets must not rely on vertical MARGIN, which
// collapses out of CM's height measurement — prefer padding for spacing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BlockWidgetSpec — registered in the live-preview walk
// ---------------------------------------------------------------------------

/** Language tags that activate the DQL widget (case-insensitive). */
const DQL_LANGUAGES: Record<string, true> = {
  dql: true,
  dataview: true,
};

const matches = (node: SyntaxNodeRef): boolean =>
  node.type.name === "FencedCode";

interface DqlBlockSpecModel extends DqlModel {
  inCursor: boolean;
}

const parse = (
  state: EditorState,
  node: SyntaxNodeRef,
): DqlBlockSpecModel | null => {
  if (node.type.name !== "FencedCode") return null;

  const doc = state.doc;
  const startLine = doc.lineAt(node.from);
  const langMatch = startLine.text.match(/^```([^\s]*)/);
  const lang = langMatch ? langMatch[1].toLowerCase() : "";
  if (!(lang in DQL_LANGUAGES)) return null;

  // Extract query body (everything between opening and closing fences).
  const endLine = doc.lineAt(node.to);
  const bodyStart = startLine.to + 1;
  const bodyEnd = endLine.from;
  const queryText =
    bodyStart < bodyEnd ? doc.sliceString(bodyStart, bodyEnd).trim() : "";

  if (!queryText) return null;

  const headPos = state.selection.main.head;
  // In reading mode the caret must not collapse the query to raw code; only
  // reveal raw source when actively editing (live preview).
  const inCursor =
    state.facet(renderModeFacet) === "live" &&
    headPos >= node.from &&
    headPos <= node.to;

  return { queryText, from: node.from, to: endLine.to, inCursor };
};

const span = (
  model: DqlBlockSpecModel,
): { from: number; to: number } | null => {
  if (model.inCursor) return null;
  return { from: model.from, to: model.to };
};

const renderWidget = (
  model: DqlBlockSpecModel,
  state: EditorState,
): DqlResultWidget | null => {
  if (model.inCursor) return null;
  return new DqlResultWidget(
    model.queryText,
    state.facet(runQueryFacet),
    state.facet(openLinkFacet),
    model.from,
    model.to,
  );
};

export const dqlBlockSpec: BlockWidgetSpec<DqlBlockSpecModel> = {
  id: "dql",
  matches,
  parse,
  span,
  render: renderWidget,
};