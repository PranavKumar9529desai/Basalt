/**
 * Diagnostic/test fixture: run a markdown doc through the full live-preview
 * decoration pipeline (StateField create) and hand back the resolved
 * `DecorationReport`, ready for `assertDecorations`.
 *
 * This is the highest-fidelity unit-level check available without an
 * EditorView: `livePreviewField` builds decorations inside `EditorState.create`,
 * so constructing a state with `livePreviewPlugin` (+ any per-fixture block
 * widgets / render-mode facets) yields a real decoration set to assert on.
 *
 * The state is built directly (NOT via `parseMarkdown`), so pipe characters are
 * preserved — table fixtures work verbatim.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, EditorSelection, type Extension } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { Tree } from "@lezer/common";
import { livePreviewPlugin } from "../../src/preview/live-preview";
import { renderModeFacet } from "../../src/preview/render-mode";
import { basaltMarkdownExtensions } from "./parse-markdown";
import { dumpDecorations, type DecorationReport } from "./dump-decos";

export interface MarkdownFixtureOptions {
  /** Extra CM6 extensions layered on top of live-preview (e.g. block widgets). */
  extensions?: Extension[];
  /** Set renderModeFacet — pass "reading" to force full render. */
  renderMode?: "live" | "reading";
  /** Cursor head position (default 0). */
  selection?: number;
}

export interface MarkdownFixture {
  readonly state: EditorState;
  readonly tree: Tree;
  readonly doc: string;
  readonly report: DecorationReport;
}

/**
 * Build a state + full-pipeline decoration report for `doc`.
 */
export function testMarkdownFixture(
  doc: string,
  opts: MarkdownFixtureOptions = {},
): MarkdownFixture {
  const extensions: Extension[] = [
    markdown({ base: markdownLanguage, extensions: basaltMarkdownExtensions }),
    livePreviewPlugin,
    ...(opts.extensions ?? []),
  ];
  if (opts.renderMode) {
    extensions.push(renderModeFacet.of(opts.renderMode));
  }

  const state = EditorState.create({
    doc,
    selection:
      opts.selection !== undefined
        ? EditorSelection.cursor(opts.selection)
        : undefined,
    extensions,
  });

  const tree = ensureSyntaxTree(state, state.doc.length, 10_000) ?? syntaxTree(state);
  const report = dumpDecorations(state);
  return { state, tree, doc, report };
}
