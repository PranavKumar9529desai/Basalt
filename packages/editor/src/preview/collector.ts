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
import { editorBenchmarkState } from "../perf/benchmark";
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
import type {
  CodeBlockCursor,
  DecorationCollector,
  DecorationContext,
} from "./types";
import { isInCodeBlockMonotonic, sortCodeBlockRanges } from "./types";

/**
 * Docs at or below this size rebuild their preview synchronously per
 * keystroke (measured ~1–2ms there — cheaper than bookkeeping). Larger docs
 * map decorations lazily through the change and defer full structure rebuilds
 * to an idle tick (see `PreviewScheduler`). Shared by the collector, the field
 * update path, and the scheduler.
 */
export const LAZY_DOC_THRESHOLD = 48 * 1024;

/**
 * Hysteresis window (ADR-040) preventing keystroke jitter near the 48KB threshold.
 * A document above LAZY_DOC_THRESHOLD remains in lazy mode until it drops below
 * (LAZY_DOC_THRESHOLD - LAZY_DOC_HYSTERESIS).
 */
export const LAZY_DOC_HYSTERESIS = 4 * 1024;

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

const lineDecoCache = new Map<string, Decoration>();
function getLineDeco(className: string): Decoration {
  let deco = lineDecoCache.get(className);
  if (!deco) {
    deco = Decoration.line({ class: className });
    lineDecoCache.set(className, deco);
  }
  return deco;
}

const markDecoCache = new Map<string, Decoration>();
function getMarkDeco(className: string): Decoration {
  let deco = markDecoCache.get(className);
  if (!deco) {
    deco = Decoration.mark({ class: className });
    markDecoCache.set(className, deco);
  }
  return deco;
}

export function makeCollector() {
  const widgets: Range<Decoration>[] = [];
  // Multi-line block-widget replaces (HTML, frontmatter) are re-exposed as
  // atomic ranges so arrow motion skips a collapsed span in one step. Single-
  // line widgets (HR, callout/code headers) stay non-atomic so the caret can
  // still land on them to reveal + edit.
  const replaces: Range<Decoration>[] = [];

  const collector: DecorationCollector = {
    addLineClass(pos, className) {
      widgets.push(getLineDeco(className).range(pos, pos));
    },
    addMark(from, to, className) {
      widgets.push(getMarkDeco(className).range(from, to));
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

  const codeBlockCursor: CodeBlockCursor = { index: 0 };
  let heading7Candidates: number[] | undefined = undefined;

  tree.iterate({
    enter(node) {
      const name = node.type.name;

      // 1. O(1) Fast-skip leaf & container nodes that never contribute decorations
      if (
        name === "Text" ||
        name === "Document" ||
        name === "BulletList" ||
        name === "OrderedList"
      ) {
        return;
      }

      // Track potential heading-7 lines when encountering Paragraph nodes (ADR-040)
      if (name === "Paragraph") {
        const firstChar = doc.sliceString(node.from, node.from + 1);
        if (firstChar === "#" || firstChar === " ") {
          const sample = doc.sliceString(
            node.from,
            Math.min(node.to, node.from + 11),
          );
          if (sample.includes("#######")) {
            (heading7Candidates ??= []).push(doc.lineAt(node.from).number);
          }
        }
        return;
      }

      // 2. Code blocks: record ranges, line classes, header/footer widgets
      if (name === "FencedCode" || name === "CodeBlock") {
        if (handleCodeBlockNode(node, 0, doc.length, ctx, collector)) {
          return false;
        }
        // DQL / mermaid code blocks returned false: let registered block widgets handle them
        const handled = handleBlockWidgetsNode(
          node,
          ctx,
          collector,
          models,
          specs,
        );
        if (handled.found) frontmatterFound = true;
        if (handled.widgeted) frontmatterWidgeted = true;
        if (handled.found) {
          return false;
        }
        // Block widget in raw edit mode: record range and skip descending into child tokens
        ctx.codeBlockRanges.push({ from: node.from, to: node.to });
        return false;
      }

      // 3. Monotonic code block containment check (O(log N) -> amortized O(1), ADR-040)
      if (
        ctx.codeBlockRanges.length > 0 &&
        isInCodeBlockMonotonic(node.from, ctx.codeBlockRanges, codeBlockCursor)
      ) {
        return false;
      }

      // 4. Fast category dispatch switch (ADR-040)
      switch (name) {
        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6":
        case "ATXHeading7":
        case "SetextHeading1":
        case "SetextHeading2":
          handleHeadingNode(node, ctx, collector);
          return;

        case "Blockquote":
          if (!handleCalloutNode(node, ctx, collector)) {
            handleBlockquoteNode(node, 0, doc.length, ctx, collector);
          }
          return;

        case "ListItem":
          handleListNode(node, ctx, collector);
          return;

        case "ListMark":
          handleListNode(node, ctx, collector);
          return;

        case "Table": {
          const handled = handleBlockWidgetsNode(
            node,
            ctx,
            collector,
            models,
            specs,
          );
          if (handled.found) frontmatterFound = true;
          if (handled.widgeted) frontmatterWidgeted = true;
          if (handleTableNode(node, ctx, collector)) {
            return false;
          }
          return;
        }

        case "HorizontalRule": {
          const line = doc.lineAt(node.from);
          const onActiveLine = ctx.activeLine?.number === line.number;
          if (!onActiveLine) {
            collector.addReplace(
              line.from,
              line.to,
              new HorizontalRuleWidget(),
            );
          }
          return;
        }

        case "HTMLBlock":
        case "YAMLFrontMatter":
        case "Frontmatter":
        case "BlockMath": {
          const handled = handleBlockWidgetsNode(
            node,
            ctx,
            collector,
            models,
            specs,
          );
          if (handled.found) frontmatterFound = true;
          if (handled.widgeted) frontmatterWidgeted = true;
          return false;
        }

        case "WikiLink":
          if (handleEmbedNode(node, ctx, collector)) {
            return false;
          }
          handleInlineNode(node, collector);
          return;

        case "InlineMath":
          if (handleInlineMathNode(node, ctx, collector)) {
            return false;
          }
          return;

        case "InlineCode":
        case "Highlight":
        case "Strikethrough":
        case "HTMLTag":
        case "StrongEmphasis":
        case "Emphasis":
          handleInlineNode(node, collector);
          return;

        case "HeaderMark":
        case "QuoteMark":
        case "LinkMark":
        case "EmphasisMark":
        case "CodeMark":
        case "HighlightMark":
        case "StrikethroughMark":
        case "WikiLinkMark":
        case "EmbedMark":
        case "InlineMathMark":
        case "BlockMathMark":
          handleMarkHidingNode(node, ctx, collector);
          return;

        default:
          handleMarkHidingNode(node, ctx, collector);
          return;
      }
    },
  });

  // Regex fallback for a frontmatter block the parser hasn't produced a node
  // for yet — only when a frontmatter widget is in play and nothing node-based
  // decorated/rendered it (covers dim mode and the pre-parse flash window).
  if (hasFrontmatter && !frontmatterFound && !frontmatterWidgeted) {
    handleFrontmatterFallback(ctx, collector);
  }

  // Heading-7 line classes (bypasses full-doc line scans if no candidate markers exist)
  handleHeading7Lines(0, doc.length, ctx, collector, heading7Candidates ?? []);

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
