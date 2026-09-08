/**
 * Live Preview — DOM walk / widget collection (ADR-038 split of
 * live-preview.ts).
 *
 * Owns the single fused pre-order tree walk that builds every live-preview
 * decoration for a document (`buildPreviewState`), the `DecorationCollector`
 * it writes into, and the `PreviewState` shape it produces. Runs inside
 * StateField create/update — no view access. See live-preview.ts for the
 * pipeline invariants (ADR-019).
 */

import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { editorBenchmarkState } from "../benchmark";
import { renderModeFacet } from "./render-mode";
import { handleBlockquoteNode } from "./blockquotes";
import { handleCalloutNode } from "./callouts";
import { handleCodeBlockNode } from "./code-blocks";
import { handleFrontmatterFallback } from "./frontmatter";
import {
  blockWidgetsFor,
  handleBlockWidgetsNode,
} from "../block-widgets/registry";
import { handleHeading7Lines, handleHeadingNode } from "./headings";
import { handleInlineNode } from "./inline-marks";
import { handleListNode } from "./lists";
import { handleMarkHidingNode } from "./mark-hiding";
import { handleEmbedNode } from "./embeds";
import { handleInlineMathNode } from "../block-widgets/math-widget";
import { handleTableNode } from "./tables";
import type { DecorationCollector, DecorationContext } from "./types";
import { isInCodeBlock, sortCodeBlockRanges } from "./types";

/**
 * Docs at or below this size rebuild their preview synchronously per
 * keystroke (measured ~1–2ms there — cheaper than bookkeeping). Larger docs
 * map decorations lazily through the change and defer full structure rebuilds
 * to an idle tick (see `PreviewScheduler`). Shared by the collector, the field
 * update path, and the scheduler.
 */
export const LAZY_DOC_THRESHOLD = 48 * 1024;

/**
 * Forced-parse budget for `ensureSyntaxTree`, doc-size adaptive (see
 * `buildPreviewState`): small docs (≤ LAZY_DOC_THRESHOLD) get enough headroom
 * to finish in one synchronous pass on the keystroke path; huge docs — where
 * typing already takes the lazy path and full rebuilds only happen on
 * selection moves / idle catch-up — are capped to ~1 frame so opening a
 * 25k-note-scale document never blocks the main thread for hundreds of ms.
 * The idle `PreviewScheduler` + CM's own background parse worker grow the
 * tree to full coverage between interactions.
 */
const PARSE_BUDGET_MS = 16;
const FULL_PARSE_BUDGET_MS = 300;

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

export const HR_THEME = EditorView.baseTheme({
  ".cm-live-hr": {
    border: "none",
    borderTop: "2px solid var(--sat-editor-hr, #1f2937)",
    margin: "0.5rem 0",
    display: "block",
  },
});

export function makeCollector() {
  const widgets: Range<Decoration>[] = [];
  // Multi-line block-widget replaces (HTML, frontmatter) are re-exposed as
  // atomic ranges so arrow motion skips a collapsed span in one step. Single-
  // line widgets (HR, callout/code headers) stay non-atomic so the caret can
  // still land on them to reveal + edit.
  const replaces: Range<Decoration>[] = [];

  const collector: DecorationCollector = {
    addLineClass(pos, className) {
      widgets.push(Decoration.line({ class: className }).range(pos, pos));
    },
    addMark(from, to, className) {
      widgets.push(Decoration.mark({ class: className }).range(from, to));
    },
    addReplace(from, to, widget, block = false, atomic = false) {
      const deco = Decoration.replace({ widget, block });
      const range = deco.range(from, to);
      widgets.push(range);
      if (atomic) replaces.push(range);
    },
    addPoint(pos, widget) {
      widgets.push(Decoration.widget({ widget, side: 1 }).range(pos, pos));
    },
  };

  function finish(): DecorationSet {
    return Decoration.set(widgets, true);
  }

  function finishAtomic(): DecorationSet {
    return Decoration.set(replaces, true);
  }

  return { collector, finish, finishAtomic };
}

export interface PreviewState {
  decorations: DecorationSet;
  /** Replace decorations (HTML, frontmatter widgets) re-exposed as atomic
   * ranges so arrow motion skips a replaced span in one step. Empty while the
   * caret is on a block (no replace emitted), so it never blocks entering to
   * edit raw source. */
  atomicRanges: DecorationSet;
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
export function buildPreviewState(
  state: EditorState,
  hasFocus: boolean,
): PreviewState {
  const t0 = performance.now();
  const { collector, finish, finishAtomic } = makeCollector();
  const headPos = state.selection.main.head;
  const doc = state.doc;
  // Reading mode never reveals raw syntax, regardless of caret/focus — force
  // activeLine to null so mark-hiding, heading-7, and other reveal logic always
  // render the rich presentation (see render-mode.ts).
  const fullyRendered = state.facet(renderModeFacet) === "reading";
  const ctx: DecorationContext = {
    // A stale focus flag must not hide syntax at the current caret position.
    // During typing, the empty selection is the authoritative active-line
    // signal; hiding a heading marker before the next input breaks DOM-to-doc
    // mapping and can insert the next character before `#`.
    activeLine:
      !fullyRendered && (hasFocus || state.selection.main.empty)
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
  // parsed, subsequent calls short-circuit. Small docs get a generous budget —
  // they re-walk synchronously per keystroke and must finish in one pass. Huge
  // docs cap each forced parse to ~1 frame: the keystroke path is lazy there,
  // and `previewScheduler` + CM's background parse worker grow the tree to full
  // coverage on idle between interactions.
  const budget =
    doc.length <= LAZY_DOC_THRESHOLD ? FULL_PARSE_BUDGET_MS : PARSE_BUDGET_MS;
  const tree = ensureSyntaxTree(state, doc.length, budget);
  if (!tree) {
    if (import.meta.env.DEV && editorBenchmarkState.debug) {
      console.log(
        `[live-preview] incomplete tree — no decorations (budget hit) docLen=${doc.length}`,
      );
    }
    return {
      decorations: Decoration.none,
      atomicRanges: Decoration.none,
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

      // Block widgets + frontmatter presentation (ADR-022 rule 14): every
      // registered block widget replaces/dims/none-s its matched blocks from
      // this single walk. Widget models are collected per-view for external
      // reads (properties panel). Dispatched BEFORE the table handler so a
      // registered table block widget can replace the whole table; otherwise
      // handleTableNode's short-circuit below would swallow Table nodes and the
      // rich table widget would never render.
      const handled = handleBlockWidgetsNode(
        node,
        ctx,
        collector,
        models,
        specs,
      );
      if (handled.found) frontmatterFound = true;
      if (handled.widgeted) frontmatterWidgeted = true;

      // Table row/delimiter line classes; skip children regardless (the block
      // widget path above has already had a chance to replace the whole table).
      if (handleTableNode(node, ctx, collector)) {
        return false;
      }

      // If a block widget matched this node but produced no replacement (cursor
      // inside the block), still skip children to prevent mark-hiding from
      // hiding code fence tokens (CodeMark — closing ```). Normal code blocks
      // never reach here because handleCodeBlockNode returns true first.
      if (
        handled.found &&
        !handled.widgeted &&
        node.type.name === "FencedCode"
      ) {
        return false;
      }

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
      // ![[embed]] -> compact chip off the active line; raw syntax revealed on it.
      handleEmbedNode(node, ctx, collector);
      // Inline LaTeX math $...$ -> rendered KaTeX widget off active line
      handleInlineMathNode(node, ctx, collector);
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

  if (import.meta.env.DEV && editorBenchmarkState.debug) {
    const elapsed = performance.now() - t0;
    console.log(
      `[live-preview] walk docLen=${doc.length} mode=${state.facet(renderModeFacet)} elapsed=${elapsed.toFixed(1)}ms`,
    );
  }

  return {
    decorations: finish(),
    atomicRanges: finishAtomic(),
    codeBlockRanges: ctx.codeBlockRanges,
    widgetModels: models,
    focused: hasFocus,
    complete: true,
  };
}
