/**
 * Live Preview — single-pass decoration engine (ADR-019).
 *
 * ## Pipeline invariants (binding, see docs/adr/019)
 *
 * 1. One keystroke = one transaction = one tree walk. Decorations are computed
 *    inside StateField/ViewPlugin update paths — NEVER dispatched from an
 *    update listener (that doubles transaction cost per keystroke).
 * 2. One fused pre-order walk feeds every handler: block decorations (line
 *    classes, replace widgets), tree-derived inline marks, and mark hiding.
 *    The old design ran three separate walks plus a nested dispatch.
 * 3. Viewport-independence: the field owns full-document decorations and never
 *    rebuilds on scroll. Only the tags scan stays viewport-scoped (it is a
 *    text pass over visible lines, not a tree pass).
 * 4. Selection-dependent work is scoped: only cursor-revealed marks/widgets
 *    recompute on selection change; everything else is rebuilt with them but
 *    from the same single walk.
 *
 * ## Decoration types
 *
 * | Type                          | What it does                                      | Where     |
 * |-------------------------------|---------------------------------------------------|-----------|
 * | Decoration.line()             | Adds a CSS class to a whole line element          | Field     |
 * | Decoration.replace()          | Hides a range / swaps in a widget                 | Field     |
 * | Decoration.mark()             | Adds a CSS class to an inline text span           | Field + tag plugin |
 *
 * Why NOT block: true — it yanks replaced ranges out of normal line flow,
 * breaking cursor navigation (arrows skip the widget, clicks don't map back).
 * Use block: false and let widget CSS control visual size.
 *
 * ## Focus model
 *
 * Builders run inside StateField updates where no view exists. Focus state is
 * tracked by `hasFocusField` via focus/blur DOM events; when unfocused, the
 * active-line reveal/hide logic keeps the document fully rendered.
 *
 * ## Module layout (ADR-038)
 *
 * This file is the engine core: field/extension composition, effects, and
 * the exported entry points (`livePreviewPlugin`, `getBlockWidgetModel`,
 * `requestPreviewRebuild`). The DOM walk lives in `./collector`, the idle
 * rebuild scheduler in `./scheduler`, and the tag-marks viewport pass in
 * `./tag-marks`.
 */

import { StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorBenchmarkState } from "../perf/benchmark";
import { BLOCKQUOTES_THEME } from "./blockquotes";
import { CALLOUTS_THEME } from "./callouts";
import { CODE_BLOCKS_THEME } from "./code-blocks";
import { FRONTMATTER_THEME } from "./frontmatter";
import { INLINE_MARKS_THEME } from "./inline-marks";
import { LISTS_THEME } from "./lists";
import { MARK_HIDING_THEME } from "./mark-hiding";
import { EMBED_PREVIEW_THEME } from "./embeds";
import { TABLES_THEME } from "./tables";
import { buildPreviewState, HR_THEME, LAZY_DOC_THRESHOLD } from "./collector";
import type { PreviewState } from "./collector";
import { rebuildPreview, previewScheduler } from "./scheduler";
import { tagMarksPlugin } from "./tag-marks";

export const LIVE_PREVIEW_THEME = [
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  CALLOUTS_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  LISTS_THEME,
  TABLES_THEME,
  FRONTMATTER_THEME,
  EMBED_PREVIEW_THEME,
  HR_THEME,
];

// Builders run with no view reference, so DOM focus is synced into the field
// via this effect instead of being read directly.
const setHasFocus = StateEffect.define<boolean>();

/**
 * The live-preview field — sole owner of document-wide decorations.
 *
 * Incremental strategy: docs ≤ `LAZY_DOC_THRESHOLD` bytes fully rebuild per
 * doc/selection change (measured ~1–2ms there — cheaper than bookkeeping).
 * Larger docs: typing only maps the existing decorations through the change
 * (position remap, no tree walk); the full walk defers to an idle tick via
 * `previewScheduler`. Explicit selection moves (click/arrows) still rebuild
 * synchronously — instant reveal matters more there, and they are off the
 * keystroke path.
 */

export const livePreviewField = StateField.define<PreviewState>({
  create: (state) => buildPreviewState(state, false),

  update(value, tr) {
    let focused = value.focused;
    let focusChanged = false;
    let forced = false;
    for (const e of tr.effects) {
      if (e.is(setHasFocus)) {
        focused = e.value;
        focusChanged = focused !== value.focused;
      } else if (e.is(rebuildPreview)) {
        forced = true;
      }
    }

    const lazy =
      tr.state.doc.length > LAZY_DOC_THRESHOLD &&
      !forced &&
      !focusChanged &&
      // Explicit selection moves (clicks, arrows) rebuild synchronously even
      // on large docs — instant reveal matters more than a sub-frame cost,
      // and they are off the keystroke path. Pure-change transactions
      // (typing) have no explicit selection and take the lazy path.
      !tr.selection;

    const path = lazy ? (tr.docChanged ? "lazy-map" : "no-op") : "full-rebuild";
    if (path !== "no-op" && import.meta.env.DEV && editorBenchmarkState.debug) {
      console.log(
        `[live-preview] field.update path=${path} docChanged=${tr.docChanged} selection=${!!tr.selection} forced=${forced} focusChanged=${focusChanged}`,
      );
    }

    if (!lazy) {
      // Full rebuild: small docs, idle-tick catch-up, focus flips, or an
      // explicitly requested rebuild. One transaction, one walk.
      return buildPreviewState(tr.state, focused);
    }

    if (tr.docChanged) {
      // Lazy path — keep every decoration positionally valid by mapping
      // through the change; structure refresh happens on the next idle tick.
      return {
        decorations: value.decorations.map(tr.changes.desc),
        atomicRanges: value.atomicRanges.map(tr.changes.desc),
        codeBlockRanges: value.codeBlockRanges.map((r) => ({
          from: tr.changes.mapPos(r.from),
          to: tr.changes.mapPos(r.to),
        })),
        widgetModels: value.widgetModels,
        focused,
        complete: value.complete,
      };
    }

    // Lazy doc, no doc change, no forced/focus trigger → nothing to do.
    return value;
  },

  provide: (f) => [
    EditorView.decorations.from(f, (s) => s.decorations),
    // Replaced multi-line block-widget spans are atoms for cursor motion:
    // ArrowUp/Down skip the HTML/frontmatter widget in one step rather than
    // sneaking through hidden positions. Empty while a block is raw (cursor on
    // it), so the caret can still enter to edit.
    EditorView.atomicRanges.of((view) => view.state.field(f).atomicRanges),
  ],
});

const focusTracking = EditorView.domEventHandlers({
  focus(_event, view) {
    if (!view.state.field(livePreviewField).focused) {
      view.dispatch({ effects: setHasFocus.of(true) });
    }
    return false;
  },
  blur(_event, view) {
    if (view.state.field(livePreviewField).focused) {
      view.dispatch({ effects: setHasFocus.of(false) });
    }
    return false;
  },
});

export const livePreviewPlugin = [
  livePreviewField,
  focusTracking,
  previewScheduler(livePreviewField),
  tagMarksPlugin(livePreviewField),
];

/** Read the first parsed model for a block widget id off a view. Per-view —
 * never a module global — so split panes each render their own state. */
export function getBlockWidgetModel<M>(view: EditorView, id: string): M | null {
  const field = view.state.field(livePreviewField, false);
  if (!field) return null;
  return (field.widgetModels[id]?.[0] as M | undefined) ?? null;
}

/** Force a synchronous full rebuild of the preview field — the one sanctioned
 * catch-up for the boot-time WASM parse race (a transport concern, not the
 * keystroke path): the first parse of a doc may happen before WASM is loaded,
 * so after `initFrontmatterWasm()` resolves, dispatch this once. */
export function requestPreviewRebuild(view: EditorView): void {
  view.dispatch({ effects: rebuildPreview.of(null) });
}