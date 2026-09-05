/**
 * Test helper: create an EditorState configured with Basalt's markdown grammar
 * (wikilinks, embeds, highlights, frontmatter, tables) and optionally extra
 * extensions (e.g. the live-preview plugin), then read a guaranteed-complete
 * Lezer tree.
 *
 * This mirrors the `base` extension group from edit/reading surfaces via the
 * syntax registry (ADR-033) without pulling in the full extension stack
 * (suggestions, WASM block-widget parsers, themes) that isn't needed for
 * grammar/handler unit tests.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  syntaxTree,
  ensureSyntaxTree,
} from "@codemirror/language";
import { EditorState, EditorSelection, type Extension } from "@codemirror/state";
import type { Tree } from "@lezer/common";
import { createBasaltGrammar } from "../../src/syntax/registry";

/** The custom Lezer markdown extensions Basalt adds on top of CommonMark —
 * folded from the syntax registry, the single source of truth. */
export const basaltMarkdownExtensions = createBasaltGrammar();

/**
 * A doc string with `|` markers for one or more cursors, e.g. `"# He|llo"`.
 * The cursor markers are stripped and parsed into a selection. This mirrors
 * the `@codemirror/lang-markdown` test helper convention.
 */
export function stripPipes(input: string): {
  doc: string;
  cursors: number[];
} {
  let doc = "";
  const cursors: number[] = [];
  let pos = 0;
  for (const ch of input) {
    if (ch === "|") {
      cursors.push(pos);
    } else {
      doc += ch;
      pos++;
    }
  }
  return { doc, cursors };
}

export interface ParseMarkdownResult {
  state: EditorState;
  /** A complete Lezer tree covering the whole document. */
  tree: Tree;
  /** The document text (cursor markers stripped). */
  doc: string;
}

/**
 * Create an EditorState + guaranteed-complete syntax tree for a markdown doc.
 *
 * @param doc  Raw markdown; may contain `|` cursor markers (unless
 *             `opts.pipes` is false, for docs where `|` is literal — tables,
 *             embed aliases).
 * @param opts.extensions  Extra CM6 extensions to layer on (e.g. `livePreviewPlugin`).
 * @param opts.selection   Cursor to set (overrides any `|` markers in `doc`).
 * @param opts.pipes       Set false to keep `|` as literal text (no cursor markers).
 */
export function parseMarkdown(
  doc: string,
  opts: {
    extensions?: Extension[];
    selection?: number | { anchor: number; head: number };
    pipes?: boolean;
  } = {},
): ParseMarkdownResult {
  const stripped = opts.pipes === false ? null : stripPipes(doc);
  const cleanDoc = stripped?.doc ?? doc;
  const cursors = stripped?.cursors ?? [];

  let selection: { anchor: number; head: number } | undefined;
  if (
    opts.selection !== undefined &&
    typeof opts.selection !== "number"
  ) {
    selection = opts.selection;
  } else if (opts.selection !== undefined) {
    selection = { anchor: opts.selection, head: opts.selection };
  } else if (cursors.length > 0) {
    selection = { anchor: cursors[0], head: cursors[0] };
  }

  const extensions: Extension[] = [
    markdown({
      base: markdownLanguage,
      extensions: basaltMarkdownExtensions,
    }),
    ...(opts.extensions ?? []),
  ];

  const state = EditorState.create({
    doc: cleanDoc,
    selection: selection
      ? EditorSelection.create([EditorSelection.cursor(selection.anchor)])
      : undefined,
    extensions,
  });

  // Force a full synchronous parse. Null only if the 10s budget is blown,
  // which is impossible for the small fixture docs used here.
  const tree =
    ensureSyntaxTree(state, state.doc.length, 10_000) ?? syntaxTree(state);

  return { state, tree, doc: cleanDoc };
}
