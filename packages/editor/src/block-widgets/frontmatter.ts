import { Facet, type Extension, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { FrontmatterWidget } from "../frontmatter-widget";
import { handleFrontmatterNode } from "../preview/frontmatter";
import type {
  FrontmatterEditFn,
  FrontmatterFetch,
  FrontmatterModel,
  ParseFrontmatterFn,
} from "../types";
import {
  blockWidgetModeFacet,
  blockWidgetSpecsFacet,
  type BlockWidgetSpec,
} from "./registry";

// ---------------------------------------------------------------------------
// Dependency facets — supplied by the feature layer via EditorConfig
// (ADR-022 rule 2: packages/editor imports no WASM/IPC/Tauri).
// ---------------------------------------------------------------------------

/** Injected synchronous frontmatter parser (WASM-backed). */
export const frontmatterParserFacet = Facet.define<
  ParseFrontmatterFn | undefined,
  ParseFrontmatterFn | undefined
>({
  combine: (values) => values[0],
});

/** Injected edit callback; the widget binds the view itself at toDOM. */
export const frontmatterEditFacet = Facet.define<
  FrontmatterEditFn | undefined,
  FrontmatterEditFn | undefined
>({
  combine: (values) => values[0],
});

/** Injected vault tag/link fetchers for tags/aliases chips. */
export const frontmatterFetchFacet = Facet.define<
  FrontmatterFetch | undefined,
  FrontmatterFetch | undefined
>({
  combine: (values) => values[0],
});

/** Force the frontmatter widget into read-only "dim" mode (e.g. preview panes). */
export const frontmatterDimMode: Extension = blockWidgetModeFacet.of([
  { id: "frontmatter", mode: "dim" },
]);

// ---------------------------------------------------------------------------
// The widget theme (the interactive Properties panel). `--sat-*` only (ADR-002).
// ---------------------------------------------------------------------------

export const FRONTMATTER_WIDGET_THEME = EditorView.baseTheme({
  ".cm-frontmatter-properties": {
    backgroundColor: "var(--sat-surface-2)",
    margin: "4px 0",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--sat-layout-border)",
    fontFamily: "var(--sat-font-sans, inherit)",
    fontSize: "12px",
  },
  ".cm-frontmatter-properties-header": {
    color: "var(--sat-text-muted)",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "6px",
  },
  ".cm-fm-row": {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    margin: "2px 0",
  },
  ".cm-fm-key": {
    flex: "0 0 140px",
    minWidth: "0",
    background: "transparent",
    border: "none",
    color: "var(--sat-text-primary)",
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: "2px 4px",
    borderRadius: "3px",
  },
  ".cm-fm-key:focus": {
    background: "var(--sat-surface-1)",
    outline: "1px solid var(--sat-accent-primary)",
  },
  ".cm-fm-value": {
    flex: "1 1 auto",
    minWidth: "0",
    background: "transparent",
    border: "none",
    color: "var(--sat-text-primary)",
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: "2px 4px",
    borderRadius: "3px",
  },
  ".cm-fm-value:focus": {
    background: "var(--sat-surface-1)",
    outline: "1px solid var(--sat-accent-primary)",
  },
  ".cm-fm-remove": {
    flex: "0 0 auto",
    background: "transparent",
    border: "none",
    color: "var(--sat-text-muted)",
    cursor: "pointer",
    fontSize: "11px",
  },
  ".cm-fm-remove:hover": { color: "var(--sat-state-danger)" },
  ".cm-fm-list": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px",
    flex: "1 1 auto",
  },
  ".cm-fm-chip": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "var(--sat-surface-1)",
    border: "1px solid var(--sat-layout-border)",
    borderRadius: "10px",
    padding: "1px 8px",
    color: "var(--sat-text-primary)",
    fontSize: "11px",
  },
  ".cm-fm-chip-x": {
    background: "transparent",
    border: "none",
    color: "var(--sat-text-muted)",
    cursor: "pointer",
    fontSize: "10px",
    padding: "0",
  },
  ".cm-fm-list-add": { flex: "0 0 90px", minWidth: "60px" },
  ".cm-fm-checkbox": { flex: "0 0 auto" },
  ".cm-fm-add .cm-fm-key, .cm-fm-add .cm-fm-value": { opacity: "0.7" },
  ".cm-fm-error .cm-fm-value": {
    outline: "1px solid var(--sat-state-warning, #f59e0b)",
  },
});

// ---------------------------------------------------------------------------
// The frontmatter block-widget spec. The single registration that gives the
// editor inline Properties; new widget types follow this same shape.
// ---------------------------------------------------------------------------

const spanFor = (
  model: FrontmatterModel,
  state: EditorState,
): { from: number; to: number } | null => {
  const end = model.blockSpan?.end;
  if (end === undefined || end === null) return null;
  // Replace the whole top-of-document block through the closing fence line
  // (matches the pre-kernel widget geometry; surgical edits stay valid
  // because the document text is untouched).
  return { from: 0, to: state.doc.lineAt(end).to };
};

const render = (
  model: FrontmatterModel,
  state: EditorState,
): FrontmatterWidget | null => {
  if (!model?.blockSpan) return null;
  const edit = state.facet(frontmatterEditFacet) ?? (() => {});
  const fetch = state.facet(frontmatterFetchFacet) ?? {};
  return new FrontmatterWidget(model, edit, fetch);
};

export const frontmatterBlockWidget: BlockWidgetSpec<FrontmatterModel> = {
  id: "frontmatter",
  matches: (node) => node.type.name === "YAMLFrontMatter",
  parse: (state) => {
    const fn = state.facet(frontmatterParserFacet);
    if (!fn) return null;
    return fn(state.doc.toString());
  },
  render,
  span: spanFor,
  decorateDim: (node, ctx, collector) => handleFrontmatterNode(node, ctx, collector),
  theme: FRONTMATTER_WIDGET_THEME,
};

/**
 * The `blockWidgets` editor group (ADR-022 rule 14): registers the frontmatter
 * widget + its injected deps. Only present when a parser is configured, so a
 * read-only surface (no parseFrontmatter) can opt into dim mode separately.
 */
export function frontmatterBlockWidgetGroup(config: {
  parseFrontmatter?: ParseFrontmatterFn;
  editFrontmatter?: FrontmatterEditFn;
  onFetchTags?: (query: string) => Promise<string[]>;
  onFetchLinks?: (query: string) => Promise<Array<{ name: string; path: string }>>;
}): Extension[] {
  return [
    // Cast through the unknown-model kernel type: spec is type-safe at the
    // dispatch boundary (specs funnel through BlockWidgetSpec<unknown>).
    blockWidgetSpecsFacet.of(frontmatterBlockWidget as BlockWidgetSpec),
    FRONTMATTER_WIDGET_THEME,
    ...(config.parseFrontmatter
      ? [frontmatterParserFacet.of(config.parseFrontmatter)]
      : []),
    frontmatterEditFacet.of(config.editFrontmatter),
    frontmatterFetchFacet.of({
      onFetchTags: config.onFetchTags,
      onFetchLinks: config.onFetchLinks,
    }),
  ];
}

export type { BlockWidgetSpec } from "./registry";