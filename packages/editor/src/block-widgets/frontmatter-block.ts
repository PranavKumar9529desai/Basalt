import { Facet, type Extension, type EditorState } from "@codemirror/state";
import { FRONTMATTER_WIDGET_THEME } from "./frontmatter-theme";
import { FrontmatterWidget } from "../frontmatter/widget";
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
  parse: (state, node) => {
    const fn = state.facet(frontmatterParserFacet);
    if (!fn) return null;
    // Frontmatter is always top-of-file (`YAMLFrontMatter` starts at offset 0),
    // so slicing 0..n passes the parser the exact same relative text the
    // full document would — the returned spans are already absolute — but
    // avoids serializing a huge note body on the keystroke path (ADR-019).
    //
    // `node.to` is Lezer's `cx.prevLineEnd()` — the position OF the `\n`
    // after the closing `---` (exclusive). CM6's `line.to` equals `node.to`
    // here (the newline is a boundary, not included in the line range), so
    // we slice to `node.to + 1` to include the trailing line terminator.
    // Without it the Rust parser's `fm_bounds` loop (frontmatter.rs) can't
    // find the closing fence because `find('\n')` returns None.
    return fn(
      state.doc.sliceString(node.from, Math.min(node.to + 1, state.doc.length)),
    );
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
export { FRONTMATTER_WIDGET_THEME } from "./frontmatter-theme";
