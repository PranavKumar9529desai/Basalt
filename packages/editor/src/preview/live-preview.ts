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
 */

import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { editorBenchmarkState } from "../benchmark";

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-live-hr";
    return hr;
  }
  ignoreEvent() {
    return true;
  }
}

const HR_THEME = EditorView.baseTheme({
  ".cm-live-hr": {
    border: "none",
    borderTop: "2px solid var(--sat-editor-hr, #1f2937)",
    margin: "0.5rem 0",
    display: "block",
  },
});

import { BLOCKQUOTES_THEME, handleBlockquoteNode } from "./blockquotes";
import { CALLOUTS_THEME, handleCalloutNode } from "./callouts";
import { CODE_BLOCKS_THEME, handleCodeBlockNode } from "./code-blocks";
import {
  FRONTMATTER_THEME,
  handleFrontmatterFallback,
} from "./frontmatter";
import {
  blockWidgetsFor,
  handleBlockWidgetsNode,
} from "../block-widgets/registry";
import { handleHeading7Lines, handleHeadingNode } from "./headings";
import {
  handleInlineNode,
  handleTagsInLine,
  INLINE_MARKS_THEME,
} from "./inline-marks";
import { handleListNode, LISTS_THEME } from "./lists";
import { handleMarkHidingNode, MARK_HIDING_THEME } from "./mark-hiding";
import { handleTableNode, TABLES_THEME } from "./tables";
import type { DecorationCollector, DecorationContext } from "./types";
import { isInCodeBlock, sortCodeBlockRanges } from "./types";

export const LIVE_PREVIEW_THEME = [
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  CALLOUTS_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  LISTS_THEME,
  TABLES_THEME,
  FRONTMATTER_THEME,
  HR_THEME,
];

function makeCollector() {
  const widgets: { from: number; to: number; deco: Decoration }[] = [];

  const collector: DecorationCollector = {
    addLineClass(pos, className) {
      widgets.push({
        from: pos,
        to: pos,
        deco: Decoration.line({ class: className }),
      });
    },
    addMark(from, to, className) {
      widgets.push({ from, to, deco: Decoration.mark({ class: className }) });
    },
    addReplace(from, to, widget, block = false) {
      widgets.push({ from, to, deco: Decoration.replace({ widget, block }) });
    },
  };

  function finish(): DecorationSet {
    return Decoration.set(
      widgets.map((w) => w.deco.range(w.from, w.to)),
      true,
    );
  }

  return { collector, finish };
}

interface PreviewState {
  decorations: DecorationSet;
  /** Code-block ranges discovered during the walk; shared with the viewport-
   * scoped tags plugin so it can skip code blocks without its own scan. */
  codeBlockRanges: { from: number; to: number }[];
  /** Per-widget parsed models collected during the walk (ADR-022 rule 14).
   * The single per-view source of truth for block widgets; read externally via
   * getBlockWidgetModel. */
  widgetModels: Record<string, unknown[]>;
  /** Last-known DOM focus, snapshotted at rebuild time so builders never
   * need a view reference. */
  focused: boolean;
  /** False while the budgeted parse has not yet covered the whole document
   * (huge notes at mount); the scheduler keeps rescheduling until true. */
  complete: boolean;
}

/**
 * Build all live-preview decorations for `state` in ONE pre-order walk of the
 * syntax tree. Runs inside StateField create/update — no view access.
 */
function buildPreviewState(
  state: EditorState,
  hasFocus: boolean,
): PreviewState {
  const { collector, finish } = makeCollector();
  const headPos = state.selection.main.head;
  const doc = state.doc;
  const ctx: DecorationContext = {
    // A stale focus flag must not hide syntax at the current caret position.
    // During typing, the empty selection is the authoritative active-line
    // signal; hiding a heading marker before the next input breaks DOM-to-doc
    // mapping and can insert the next character before `#`.
    activeLine: hasFocus || state.selection.main.empty
      ? (() => {
          const l = doc.lineAt(headPos);
          return { from: l.from, to: l.to, number: l.number };
        })()
      : null,
    headPos,
    state,
    codeBlockRanges: [],
  };

  // Full-document coverage is required for StateField-provided line/replace
  // decorations. Budgeted so first paint on huge notes is never blocked; once
  // parsed, subsequent calls short-circuit.
  const tree = ensureSyntaxTree(state, doc.length, 300);
  if (!tree) {
    return {
      decorations: Decoration.none,
      codeBlockRanges: [],
      widgetModels: {},
      focused: hasFocus,
      complete: false,
    };
  }

  // Block-widget specs are read once per rebuild (ADR-019 rule 2 — dispatch
  // happens inside this single walk). New widget types contribute here; they
  // never add another tree pass.
  const specs = blockWidgetsFor(state);
  const hasFrontmatter = specs.some((s) => s.id === "frontmatter");
  const models: Record<string, unknown[]> = {};
  let frontmatterFound = false;
  let frontmatterWidgeted = false;

  tree.iterate({
    enter(node) {
      // Code blocks: ranges recorded FIRST (pre-order ⇒ parents before
      // children, so the binary-search skip below stays valid mid-walk),
      // then line classes + header/footer block widgets. Children skipped.
      if (handleCodeBlockNode(node, 0, doc.length, ctx, collector)) {
        return false;
      }

      if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
        return false;
      }

      // Heading line classes
      handleHeadingNode(node, ctx, collector);

      // Try callout first — if it matches, skip plain blockquote styling
      if (!handleCalloutNode(node, ctx, collector)) {
        handleBlockquoteNode(node, 0, doc.length, ctx, collector);
      }

      // List item depth classes + bullet/number widgets
      handleListNode(node, ctx, collector);

      // Table row/delimiter line classes
      if (handleTableNode(node, ctx, collector)) {
        return false;
      }

      // Block widgets + frontmatter presentation (ADR-022 rule 14): every
      // registered block widget replaces/dims/none-s its matched blocks from
      // this single walk. Widget models are collected per-view for external
      // reads (properties panel).
      const handled = handleBlockWidgetsNode(node, ctx, collector, models, specs);
      if (handled.found) frontmatterFound = true;
      if (handled.widgeted) frontmatterWidgeted = true;

      // Horizontal rule: replace with <hr> widget when cursor is off the line
      if (node.type.name === "HorizontalRule") {
        const line = doc.lineAt(node.from);
        const onActiveLine = ctx.activeLine?.number === line.number;
        if (!onActiveLine) {
          collector.addReplace(line.from, line.to, new HorizontalRuleWidget());
        }
      }

      // Inline marks (inline code, wikilinks) + WYSIWYG mark hiding —
      // formerly a separate viewport-only pass with its own full-tree
      // pre-scan; fused here per ADR-019 rule 2.
      handleInlineNode(node, collector);
      handleMarkHidingNode(node, ctx, collector);
    },
  });

  // Regex fallback for a frontmatter block the parser hasn't produced a node
  // for yet — only when a frontmatter widget is in play and nothing node-based
  // decorated/rendered it (covers dim mode and the pre-parse flash window).
  if (hasFrontmatter && !frontmatterFound && !frontmatterWidgeted) {
    handleFrontmatterFallback(ctx, collector);
  }

  // Heading-7 line classes (post-walk)
  handleHeading7Lines(0, doc.length, ctx, collector);

  // Pre-order traversal emits ranges in document order, but the binary-search
  // contract of isInCodeBlock deserves a cheap defensive sort.
  sortCodeBlockRanges(ctx.codeBlockRanges);

  return {
    decorations: finish(),
    codeBlockRanges: ctx.codeBlockRanges,
    widgetModels: models,
    focused: hasFocus,
    complete: true,
  };
}

// Builders run with no view reference, so DOM focus is synced into the field
// via this effect instead of being read directly.
const setHasFocus = StateEffect.define<boolean>();

/** Force a synchronous full rebuild from the current state. */
const rebuildPreview = StateEffect.define<null>();

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

const LAZY_DOC_THRESHOLD = 48 * 1024;

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

  provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
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

/** Base idle timeout before a deferred rebuild is forced regardless. */
const IDLE_REBUILD_TIMEOUT_MS = 350;

/**
 * Idle scheduler — defers full structure rebuilds on large documents.
 * Typing on big notes maps decorations lazily (see `livePreviewField`); this
 * plugin dispatches `rebuildPreview` when the main thread goes idle so the
 * structure catches up between keystrokes. Also covers mount-time parse
 * growth on huge files. Never schedules while a benchmark is running —
 * measurements must see the pure keystroke path.
 */
class PreviewScheduler {
  private scheduled = false;

  constructor(_view: EditorView) {
    // Mount-time catch-up: covers budgeted-parse growth on huge notes that
    // would otherwise stay undecorated until the first interaction.
    this.schedule(_view);
  }

  update(update: {
    docChanged: boolean;
    selectionSet: boolean;
    view: EditorView;
  }) {
    const field = update.view.state.field(livePreviewField, false);
    // Docs at or below LAZY_DOC_THRESHOLD rebuilt synchronously in the field
    // during this same transaction — an idle rebuild would be pure waste.
    const isLazyDoc =
      update.view.state.doc.length > LAZY_DOC_THRESHOLD ||
      (field !== undefined && !field.complete);
    if (
      (update.docChanged || update.selectionSet) &&
      isLazyDoc &&
      !this.scheduled &&
      !editorBenchmarkState.active
    ) {
      this.schedule(update.view);
    }
  }

  private schedule(view: EditorView) {
    if (editorBenchmarkState.active) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      if (editorBenchmarkState.active) return;
      view.dispatch({ effects: rebuildPreview.of(null) });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: IDLE_REBUILD_TIMEOUT_MS });
    } else {
      setTimeout(run, 32);
    }
  }
}

const previewScheduler = ViewPlugin.fromClass(PreviewScheduler);

/** The one viewport-scoped pass — a text regex over visible lines, not a
 * tree walk. Tags don't have their own tree nodes, so scanning the visible
 * region is cheaper than a full-document pass. */
class TagMarksPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildTagMarks(view);
  }

  update(update: {
    docChanged: boolean;
    viewportChanged: boolean;
    view: EditorView;
  }) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildTagMarks(update.view);
    }
  }
}

function buildTagMarks(view: EditorView): DecorationSet {
  const { collector, finish } = makeCollector();
  const ranges = view.state.field(livePreviewField).codeBlockRanges;

  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(range.to);
    for (let ln = startLine.number; ln <= endLine.number; ln++) {
      const line = view.state.doc.line(ln);
      handleTagsInLine(line.from, line.text, ranges, collector);
    }
  }
  return finish();
}

const tagMarksPlugin = ViewPlugin.fromClass(TagMarksPlugin, {
  decorations: (v) => v.decorations,
});

export const livePreviewPlugin = [
  livePreviewField,
  focusTracking,
  previewScheduler,
  tagMarksPlugin,
];

/** Read the first parsed model for a block widget id off a view. Per-view —
 * never a module global — so split panes each render their own state. */
export function getBlockWidgetModel<M>(
  view: EditorView,
  id: string,
): M | null {
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
