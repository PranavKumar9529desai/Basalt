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

/**
 * Dependency facets injected by the feature layer via `EditorConfig`, so
 * `packages/editor` never imports WASM/IPC/Tauri.
 */

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

/** The interactive Properties panel; uses `--sat-*` tokens only. */
export const FRONTMATTER_WIDGET_THEME = EditorView.baseTheme({
  ".cm-frontmatter-properties": {
    backgroundColor: "transparent",
    margin: "0 0 var(--sat-editor-property-body-gap, 8px)",
    // Keep the section distinct from the inline note title while leaving the
    // label visually attached to the property rows below it.
    padding: "var(--sat-editor-property-title-gap) 0 0",
    borderBottom: "none",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-frontmatter-properties-header": {
    color: "var(--sat-editor-section-label-color, var(--sat-text-primary))",
    fontFamily: "inherit",
    fontSize: "var(--sat-editor-section-label-size, inherit)",
    fontWeight: "var(--sat-editor-section-label-weight, 500)",
    lineHeight: "inherit",
    margin: "0 0 var(--sat-editor-property-label-gap, 2px)",
  },
  ".cm-fm-row": {
    display: "flex",
    alignItems: "center",
    gap: "var(--sat-editor-property-gap, 8px)",
    margin: "0 -8px",
    padding: "2px 8px",
    minHeight: "var(--sat-editor-property-row-height, 1.75em)",
    border: "1px solid transparent",
    borderRadius: "var(--sat-layout-radius-md, 8px)",
    transition: "background-color 120ms ease, border-color 120ms ease",
  },
  ".cm-fm-row:hover, .cm-fm-row:focus-within": {
    backgroundColor: "var(--sat-editor-property-hover-background)",
    borderColor: "var(--sat-editor-property-hover-border)",
  },
  ".cm-fm-row:focus-within": {
    boxShadow: "0 0 0 1px var(--sat-editor-property-focus-ring)",
  },
  ".cm-fm-row:hover .cm-fm-icon, .cm-fm-row:focus-within .cm-fm-icon": {
    color: "var(--sat-text-primary)",
  },
  ".cm-fm-icon": {
    flex: "0 0 var(--sat-editor-property-icon-size, 16px)",
    width: "var(--sat-editor-property-icon-size, 16px)",
    height: "var(--sat-editor-property-icon-size, 16px)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--sat-editor-property-icon-color, var(--sat-text-muted))",
    opacity: "0.9",
  },
  ".cm-fm-icon svg": {
    width: "calc(var(--sat-editor-property-icon-size, 16px) - 2px)",
    height: "calc(var(--sat-editor-property-icon-size, 16px) - 2px)",
    display: "block",
  },
  ".cm-fm-key": {
    flex: "0 1 var(--sat-editor-property-key-width, 150px)",
    width: "var(--sat-editor-property-key-width, 150px)",
    minWidth: "0",
    background: "transparent",
    border: "none",
    color: "var(--sat-editor-property-key-color, var(--sat-text-muted))",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    padding: "2px 0",
    borderRadius: "3px",
  },
  ".cm-fm-key:focus": {
    background: "transparent",
    outline: "none",
    boxShadow: "none",
  },
  ".cm-fm-value": {
    flex: "1 1 auto",
    minWidth: "0",
    background: "transparent",
    border: "none",
    color: "var(--sat-editor-property-value-color, var(--sat-text-primary))",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    padding: "2px 0",
    borderRadius: "3px",
  },
  ".cm-fm-value:focus": {
    background: "transparent",
    outline: "none",
    boxShadow: "none",
  },
  ".cm-fm-value.cm-fm-empty::placeholder": {
    color: "var(--sat-editor-property-empty-color, var(--sat-text-muted))",
    opacity: "1",
  },
  ".cm-fm-list": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--sat-spacing-xs, 4px)",
    flex: "1 1 auto",
    position: "relative",
  },
  ".cm-fm-suggestions": {
    position: "absolute",
    zIndex: "5",
    left: "0",
    top: "calc(100% + 2px)",
    display: "flex",
    flexDirection: "column",
    minWidth: "160px",
    maxHeight: "180px",
    overflowY: "auto",
    padding: "4px",
    background: "var(--sat-editor-popover-bg, var(--sat-surface-2))",
    border:
      "1px solid var(--sat-editor-popover-border, var(--sat-layout-border))",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    boxShadow: "var(--sat-layout-shadow-md)",
  },
  ".cm-fm-suggestions[hidden]": { display: "none" },
  ".cm-fm-suggestion": {
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "var(--sat-editor-popover-text, var(--sat-text-primary))",
    font: "inherit",
    padding: "4px 6px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    cursor: "pointer",
  },
  ".cm-fm-suggestion:hover, .cm-fm-suggestion:focus-visible": {
    background: "var(--sat-editor-popover-active-bg, var(--sat-surface-3))",
    outline: "none",
  },
  ".cm-fm-chip": {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--sat-spacing-xs, 4px)",
    background: "color-mix(in srgb, var(--sat-text-primary) 8%, transparent)",
    border:
      "1px solid color-mix(in srgb, var(--sat-text-primary) 12%, transparent)",
    borderRadius: "var(--sat-radius-pill, 999px)",
    padding: "1px 8px",
    color: "var(--sat-text-primary)",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-fm-chip-x": {
    background: "transparent",
    border: "none",
    color: "var(--sat-text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    padding: "0",
  },
  ".cm-fm-list-add": { flex: "0 0 90px", minWidth: "60px" },
  ".cm-fm-checkbox": { flex: "0 0 auto" },
  ".cm-fm-add .cm-fm-key, .cm-fm-add .cm-fm-value": { opacity: "0.7" },
  ".cm-fm-add-editor": {
    display: "flex",
    alignItems: "center",
    gap: "var(--sat-editor-property-gap, 8px)",
    flex: "1 1 auto",
  },
  ".cm-fm-add-editor[hidden]": { display: "none" },
  ".cm-fm-add-action": {
    background: "transparent",
    border: "none",
    color: "var(--sat-text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    padding: "2px 0",
  },
  ".cm-fm-add-action:hover": {
    color: "var(--sat-text-primary)",
  },
  ".cm-fm-error .cm-fm-value": {
    outline: "none",
    boxShadow: "0 1px 0 0 var(--sat-state-warning, #f59e0b)",
  },
});

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
  decorateDim: (node, ctx, collector) =>
    handleFrontmatterNode(node, ctx, collector),
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
  onFetchLinks?: (
    query: string,
  ) => Promise<Array<{ name: string; path: string }>>;
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
