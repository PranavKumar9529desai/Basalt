import { Facet, type Extension, type EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import type { WidgetType } from "@codemirror/view";
import type {
  DecorationCollector,
  DecorationContext,
} from "../preview/types";

/**
 * Generic block-widget kernel (ADR-022 rule 14).
 *
 * A block widget is a syntax-node-matchable block that gets replaced on screen
 * by an interactive widget while the document text stays untouched. Any
 * feature can contribute one via `registerBlockWidget` — the kernel builds all
 * of them inside live-preview's single tree walk (ADR-019 rule 2), so N widget
 * types still cost one pass, and every widget's state stays per-view (ADR-022
 * rule 10: no editor-state in module globals).
 */

/** How a block widget renders in a given editor surface. */
export type BlockWidgetMode = "widget" | "dim" | "none";

/**
 * A block-widget contribution. All callbacks are pure: parsing is synchronous
 * (WASM, injected via facets — never the async IPC path) and can run inside a
 * StateField update where no view exists. The widget itself receives the view
 * in `toDOM` and binds its edit callbacks there.
 */
export interface BlockWidgetSpec<Model = unknown> {
  /** Stable unique id, e.g. "frontmatter". */
  id: string;
  /** Cheap gate on the syntax node — false skips with zero cost. */
  matches(node: SyntaxNodeRef): boolean;
  /** Synchronous parse of the matched block; null = don't render here. */
  parse?(state: EditorState, node: SyntaxNodeRef): Model | null;
  /** Render the interactive widget, or null to fall through to the next mode. */
  render?(model: Model, state: EditorState): WidgetType | null;
  /** The block span to replace; defaults to the node's line range. */
  span?(model: Model, state: EditorState): { from: number; to: number } | null;
  /** Read-only (dim) presentation for the same block, used in "dim" mode. */
  decorateDim?(
    node: SyntaxNodeRef,
    ctx: DecorationContext,
    collector: DecorationCollector,
  ): boolean;
  /** CSS for the widget / dim presentation. */
  theme?: Extension;
}

/** Registered specs, combined in registration order (deterministic, ADR-018). */
export const blockWidgetSpecsFacet = Facet.define<
  BlockWidgetSpec,
  readonly BlockWidgetSpec<unknown>[]
>({
  combine: (values) => values,
});

/** Per-surface display mode, keyed by widget id ("widget" by default). */
export const blockWidgetModeFacet = Facet.define<
  { id: string; mode: BlockWidgetMode }[],
  Record<string, BlockWidgetMode>
>({
  combine: (values) => {
    const map: Record<string, BlockWidgetMode> = {};
    for (const entry of values.flat()) map[entry.id] = entry.mode;
    return map;
  },
});

export function registerBlockWidget<M>(spec: BlockWidgetSpec<M>): Extension {
  return blockWidgetSpecsFacet.of(spec);
}

export function blockWidgetsFor(
  state: EditorState,
): readonly BlockWidgetSpec<unknown>[] {
  return state.facet(blockWidgetSpecsFacet);
}

export function blockWidgetMode(state: EditorState, id: string): BlockWidgetMode {
  return state.facet(blockWidgetModeFacet)[id] ?? "widget";
}

export interface BlockWidgetWalkResult {
  /** True when a node-based dim presentation was emitted. */
  found: boolean;
  /** True when a replace-widget was emitted (suppresses regex fallbacks). */
  widgeted: boolean;
}

/**
 * Fused into live-preview's single tree walk (ADR-019 rule 2): dispatch a node
 * to every registered block widget per its display mode. "widget" replaces the
 * block span and stashes the parsed model for external reads (properties
 * panel); "dim" runs the read-only presentation; "none" skips. Widgets'
 * models go into `models[spec.id]` (per-view, one entry per matched block).
 * `specs` is hoisted by the caller (a single facet read per rebuild, not per
 * node).
 */
export function handleBlockWidgetsNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
  models: Record<string, unknown[]>,
  specs: readonly BlockWidgetSpec<unknown>[],
): BlockWidgetWalkResult {
  let found = false;
  let widgeted = false;
  for (const spec of specs) {
    if (!spec.matches(node)) continue;
    if (blockWidgetMode(ctx.state, spec.id) === "dim") {
      if (spec.decorateDim?.(node, ctx, collector)) found = true;
      continue;
    }
    const model = spec.parse?.(ctx.state, node);
    if (!model) continue;
    const widget = spec.render?.(model, ctx.state);
    if (!widget) continue;
    const span =
      spec.span?.(model, ctx.state) ??
      ({ from: node.from, to: ctx.state.doc.lineAt(node.to).to } as { from: number; to: number });
    if (!span) continue;
    collector.addReplace(span.from, span.to, widget, true);
    (models[spec.id] ??= []).push(model);
    widgeted = true;
    found = true;
  }
  return { found, widgeted };
}

// `getBlockWidgetModel` (read models off a view) lives next to the field that
// owns them — `preview/live-preview.ts` — avoiding a circular import.