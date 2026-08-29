import {
  EditorState,
  Facet,
  RangeSetBuilder,
  StateField,
  StateEffect,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { FrontmatterModel, ParseFrontmatterFn } from "./types";

interface FrontmatterData {
  model: FrontmatterModel | null;
  /** End offset (UTF-16 doc coords) of the frontmatter block, or 0 if none. */
  end: number;
  decorations: DecorationSet;
}

/**
 * Supplies the injected frontmatter parser. Provided by the `frontmatter`
 * extension group when `EditorConfig.parseFrontmatter` is set, so this
 * package imports no WASM/IPC (ADR-022 rule 2).
 */
export const frontmatterParserFacet = Facet.define<
  ParseFrontmatterFn | undefined,
  ParseFrontmatterFn | undefined
>({
  combine: (values) => values[0],
});

/** Force the model plugin to reparse from the (now-updated) cache. Dispatched
 * by the feature layer after an async `parse_frontmatter` invoke resolves
 * (the editor calls the parser synchronously, so the cache is the bridge). */
export const forceFrontmatterReparse = StateEffect.define<null>();

function buildDecorations(model: FrontmatterModel): DecorationSet {
  const diagnostics = [...model.diagnostics].sort(
    (a, b) => a.span.start - b.span.start,
  );
  const builder = new RangeSetBuilder<Decoration>();
  for (const d of diagnostics) {
    builder.add(
      d.span.start,
      d.span.end,
      Decoration.mark({ class: "cm-frontmatter-diagnostic" }),
    );
  }
  return builder.finish();
}

function build(state: EditorState): FrontmatterData {
  const fn = state.facet(frontmatterParserFacet);
  if (!fn) {
    return { model: null, end: 0, decorations: Decoration.none };
  }
  const model = fn(state.doc.toString());
  if (!model) {
    // Cache miss: the synchronous bridge hasn't resolved yet. Skip until the
    // async refresh dispatches forceFrontmatterReparse (ADR-022 rule 2).
    return { model: null, end: 0, decorations: Decoration.none };
  }
  const end = model.blockSpan ? model.blockSpan.end : 0;
  return { model, end, decorations: buildDecorations(model) };
}

const frontmatterState = StateField.define<FrontmatterData>({
  create: (state) => build(state),
  update: (value, tr) => {
    // Async refresh: the feature layer updated the cache and asked for a
    // recompute. Rebuild from the fresh model.
    if (tr.effects.some((e) => e.is(forceFrontmatterReparse))) {
      return build(tr.state);
    }
    if (!tr.docChanged) return value;
    // ADR-022 rule 3: reparse only when the change could affect frontmatter.
    // Known block → only when the change touches it. No known block yet →
    // only when the change is near the top (user may be creating one). Body
    // typing on a no-frontmatter doc costs zero frontmatter work.
    const touchesFm =
      value.end > 0
        ? tr.changes.touchesRange(0, value.end)
        : tr.changes.touchesRange(0, Math.min(4, tr.state.doc.length));
    if (!touchesFm) return value;
    return build(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

export const FRONTMATTER_DIAGNOSTIC_THEME = EditorView.baseTheme({
  ".cm-frontmatter-diagnostic": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--sat-state-warning, #f59e0b)",
    textUnderlineOffset: "2px",
  },
});

/** Pure editor extension: holds the live frontmatter model + diagnostics. */
export const frontmatterModelPlugin: Extension[] = [
  frontmatterState,
  FRONTMATTER_DIAGNOSTIC_THEME,
];

export function getFrontmatterModel(view: EditorView): FrontmatterModel | null {
  return view.state.field(frontmatterState).model;
}

export function getFrontmatterBlockSpan(
  view: EditorView,
): { start: number; end: number } | null {
  return view.state.field(frontmatterState).model?.blockSpan ?? null;
}

export function requestFrontmatterReparse(view: EditorView): void {
  view.dispatch({ effects: forceFrontmatterReparse.of(null) });
}
