/**
 * Live Preview Orchestrator
 *
 * ## Decoration types and where they live
 *
 * | Type                          | What it does                                      | Where it lives  |
 * |-------------------------------|---------------------------------------------------|-----------------|
 * | Decoration.line()             | Adds a CSS class to a whole line element          | StateField only |
 * | Decoration.replace({ block: false }) | Hides a range and shows a widget inline.   | StateField only |
 * |                               | The line still exists in the document — cursor    |                 |
 * |                               | can navigate to it via click or arrow keys.       |                 |
 * | Decoration.mark()             | Adds a CSS class to an inline text span           | ViewPlugin only |
 *
 * ## Why NOT block: true
 *
 * Decoration.replace({ block: true }) yanks the replaced range out of normal
 * line flow and treats it as a floating block between lines. This breaks cursor
 * navigation: up/down arrows skip the widget entirely and mouse clicks on it do
 * not map back to any document position. Avoid it — use block: false (default)
 * and let the widget's own CSS (display: block / flex) control its visual size.
 *
 * ## Why StateField vs ViewPlugin
 *
 * Decoration.line() and Decoration.replace() must be provided by a StateField
 * because CodeMirror requires those decoration sets to cover the full document
 * (not just the visible viewport). ViewPlugins are only allowed to emit
 * Decoration.mark() (inline marks), which are safe to produce per-viewport.
 *
 * Architecture:
 *   StateField  `livePreviewBlockField`
 *     - Iterates the FULL syntax tree on every relevant change.
 *     - Emits: Decoration.line() classes, Decoration.replace() widgets
 *       (HR, callout header, code fence header/footer).
 *
 *   ViewPlugin  `livePreviewInlinePlugin`
 *     - Iterates only visible ranges.
 *     - Emits: Decoration.mark() only (inline-code, wikilink, mark-hiding).
 *
 * Both are exported together as `livePreviewPlugin` (an array of extensions).
 */

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";

// ---------------------------------------------------------------------------
// Horizontal Rule widget
// ---------------------------------------------------------------------------

class HorizontalRuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-live-hr";
    return hr;
  }
  ignoreEvent() { return true; }
}

const HR_THEME = EditorView.baseTheme({
  ".cm-live-hr": {
    border: "none",
    borderTop: "2px solid var(--sat-editor-hr, #1f2937)",
    margin: "0.5rem 0",
    display: "block",
  },
});
import {
  BLOCKQUOTES_THEME,
  handleBlockquoteNode,
} from "./decorations/blockquotes";
import { CALLOUTS_THEME, handleCalloutNode } from "./decorations/callouts";
import {
  CODE_BLOCKS_THEME,
  handleCodeBlockNode,
} from "./decorations/code-blocks";
// Handler modules
import {
  HEADINGS_THEME,
  handleHeading7Lines,
  handleHeadingNode,
} from "./decorations/headings";
import {
  FRONTMATTER_THEME,
  handleFrontmatterFallback,
  handleFrontmatterNode,
} from "./decorations/frontmatter";
import {
  handleInlineNode,
  handleTagsInLine,
  INLINE_MARKS_THEME,
} from "./decorations/inline-marks";
import {
  handleMarkHidingNode,
  MARK_HIDING_THEME,
} from "./decorations/mark-hiding";
import { handleListNode, LISTS_THEME } from "./decorations/lists";
import { handleTableNode, TABLES_THEME } from "./decorations/tables";
import type {
  DecorationCollector,
  DecorationContext,
} from "./decorations/types";
import { isInCodeBlock } from "./decorations/types";

// ---------------------------------------------------------------------------
// Composed Theme
// ---------------------------------------------------------------------------

export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// StateField – block decorations (line classes + block replace widgets)
// ---------------------------------------------------------------------------

function buildBlockDecorations(view: EditorView): DecorationSet {
  const { collector, finish } = makeCollector();

  // We need selection info for cursor-inside-block checks.
  const headPos = view.state.selection.main.head;

  const ctx: DecorationContext = {
    activeLine: view.hasFocus
      ? (() => {
          const l = view.state.doc.lineAt(headPos);
          return { from: l.from, to: l.to, number: l.number };
        })()
      : null,
    headPos,
    view,
    codeBlockRanges: [],
  };

  // Walk the FULL document so block decorations outside the viewport are
  // still registered (required by CodeMirror for StateField-provided decos).
  const tree =
    ensureSyntaxTree(view.state, view.state.doc.length, 50) ??
    syntaxTree(view.state);

  let frontmatterFound = false;

  tree.iterate({
    enter(node) {
      // Code blocks: line classes + header/footer block widgets
      if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
        return false;
      }

      if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
        return false;
      }

      // Heading line classes
      handleHeadingNode(node, ctx, collector);

      // Try callout first — if it matches, skip plain blockquote styling
      if (!handleCalloutNode(node, ctx, collector)) {
        handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);
      }

      // List item depth classes + bullet/number widgets
      handleListNode(node, ctx, collector);

      // Table row/delimiter line classes
      if (handleTableNode(node, ctx, collector)) {
        return false;
      }

      if (handleFrontmatterNode(node, ctx, collector)) {
        frontmatterFound = true;
      }

      // Horizontal rule: replace with <hr> widget when cursor is off the line
      if (node.type.name === "HorizontalRule") {
        const line = ctx.view.state.doc.lineAt(node.from);
        const onActiveLine = ctx.activeLine?.number === line.number;
        if (!onActiveLine) {
          collector.addReplace(line.from, line.to, new HorizontalRuleWidget());
        }
      }
    },
  });

  if (!frontmatterFound) {
    handleFrontmatterFallback(ctx, collector);
  }

  // Heading-7 line classes (post-walk)
  handleHeading7Lines(0, view.state.doc.length, ctx, collector);

  return finish();
}

// ---------------------------------------------------------------------------
// ViewPlugin – inline decorations (marks only, NO block)
// ---------------------------------------------------------------------------

function buildInlineDecorations(view: EditorView): DecorationSet {
  const { collector, finish } = makeCollector();

  const headPos = view.state.selection.main.head;

  const ctx: DecorationContext = {
    activeLine: view.hasFocus
      ? (() => {
          const l = view.state.doc.lineAt(headPos);
          return { from: l.from, to: l.to, number: l.number };
        })()
      : null,
    headPos,
    view,
    codeBlockRanges: [],
  };

  // First pass: collect code block ranges so inline handlers can skip them.
  // We use syntaxTree (non-blocking) here since this runs in the view layer.
  const fullTree = syntaxTree(view.state);
  fullTree.iterate({
    enter(node) {
      const name = node.type.name;
      if (name === "FencedCode" || name === "CodeBlock") {
        ctx.codeBlockRanges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });

  // Second pass: inline marks over visible ranges only
  for (const range of view.visibleRanges) {
    const rangeFrom = range.from;
    const rangeTo = range.to;

    const tree =
      ensureSyntaxTree(view.state, rangeTo, 50) ?? syntaxTree(view.state);

    tree.iterate({
      from: rangeFrom,
      to: rangeTo,
      enter(node) {
        if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
          return false;
        }
        handleInlineNode(node, collector);
        handleMarkHidingNode(node, ctx, collector);
      },
    });
  }

  // Tag scan: regex pass over visible lines
  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(range.to);
    for (let ln = startLine.number; ln <= endLine.number; ln++) {
      const line = view.state.doc.line(ln);
      handleTagsInLine(line.from, line.text, ctx.codeBlockRanges, collector);
    }
  }

  return finish();
}

const livePreviewInlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view);
    }

    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      selectionSet: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildInlineDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// ---------------------------------------------------------------------------
// Block decoration updater – keeps the StateField in sync with the view
// ---------------------------------------------------------------------------

const blockDecorationUpdater = EditorView.updateListener.of((update) => {
  if (
    update.docChanged ||
    update.selectionSet ||
    update.viewportChanged ||
    update.focusChanged
  ) {
    const newDecos = buildBlockDecorations(update.view);
    update.view.dispatch({
      effects: setBlockDecorations.of(newDecos),
    });
  }
});

const setBlockDecorations = StateEffect.define<DecorationSet>();

// Re-export the StateField with effect handling baked in
export const livePreviewBlockFieldWithEffects =
  StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decos, tr) {
      for (const e of tr.effects) {
        if (e.is(setBlockDecorations)) return e.value;
      }
      return tr.docChanged ? decos.map(tr.changes) : decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export const livePreviewPlugin = [
  livePreviewBlockFieldWithEffects,
  blockDecorationUpdater,
  livePreviewInlinePlugin,
];
