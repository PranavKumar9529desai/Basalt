/**
 * Test helper: build a real `DecorationContext` for a markdown doc so preview
 * handler tests (`handleHeadingNode`, `handleCalloutNode`, etc.) can run
 * against a genuine `EditorState` + doc, without an EditorView.
 *
 * The context needs: `activeLine` (from focus + cursor), `headPos`, `state`
 * (a real EditorState with the grammar so `state.doc.lineAt` works), and a
 * mutable `codeBlockRanges` array.
 *
 * See `mock-collector.ts` for the matching collector to pass alongside it.
 */

import type { EditorState } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import type { DecorationContext } from "../../src/preview/types";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState as CMS } from "@codemirror/state";
import { basaltMarkdownExtensions } from "./parse-markdown";

export interface MakeContextOptions {
  /** Cursor head position; defaults to 0. */
  headPos?: number;
  /** Whether the editor is focused (activeLine present when true). */
  focused?: boolean;
  /** Pre-populated code-block ranges (usually empty; handlers fill it). */
  codeBlockRanges?: DecorationContext["codeBlockRanges"];
  /** Extra CM6 extensions for the underlying state. */
  extensions?: unknown;
}

/**
 * Build a DecorationContext for `doc`, with an optional cursor selection so
 * `headPos` and `activeLine` reflect a real (single) selection.
 *
 * When `selection` is given, it must be within `doc` after any `|` markers are
 * stripped (pass the clean doc here; use `stripPipes` first if needed).
 */
export function makeContext(
  doc: string,
  opts: MakeContextOptions = {},
): {
  ctx: DecorationContext;
  state: EditorState;
  doc: string;
} {
  const headPos = opts.headPos ?? 0;
  const extensions = [
    markdown({ base: markdownLanguage, extensions: basaltMarkdownExtensions }),
    ...(Array.isArray(opts.extensions) ? opts.extensions : []),
  ];
  const state = CMS.create({
    doc,
    selection: EditorSelection.cursor(headPos),
    extensions,
  });

  const activeLine =
    opts.focused === false
      ? null
      : (() => {
          const l = state.doc.lineAt(headPos);
          return { from: l.from, to: l.to, number: l.number };
        })();

  return {
    ctx: makeCtx(state, headPos, activeLine, opts.codeBlockRanges ?? []),
    state,
    doc,
  };
}

function makeCtx(
  state: EditorState,
  headPos: number,
  activeLine: DecorationContext["activeLine"],
  codeBlockRanges: DecorationContext["codeBlockRanges"],
): DecorationContext {
  return {
    activeLine,
    headPos,
    state,
    codeBlockRanges,
  };
}

/** Convenience: an unfocused context (activeLine = null). */
export function makeUnfocusedContext(
  doc: string,
  opts: Omit<MakeContextOptions, "focused"> = {},
) {
  return makeContext(doc, { ...opts, focused: false });
}
