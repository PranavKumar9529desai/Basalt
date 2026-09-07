/**
 * Live Preview — tag decoration marks (ADR-038 split of live-preview.ts).
 *
 * The one viewport-scoped pass — a text regex over visible lines, not a tree
 * walk. Tags don't have their own tree nodes, so scanning the visible region
 * is cheaper than a full-document pass. See live-preview.ts for the pipeline
 * invariants (ADR-019).
 */

import type { StateField } from "@codemirror/state";
import { EditorView, type DecorationSet, ViewPlugin } from "@codemirror/view";
import { makeCollector, type PreviewState } from "./collector";
import { handleTagsInLine } from "./inline-marks";

class TagMarksPlugin {
  decorations: DecorationSet;
  private readonly field: StateField<PreviewState>;

  constructor(view: EditorView, field: StateField<PreviewState>) {
    this.field = field;
    this.decorations = buildTagMarks(view, field);
  }

  update(update: {
    docChanged: boolean;
    viewportChanged: boolean;
    view: EditorView;
  }) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildTagMarks(update.view, this.field);
    }
  }
}

function buildTagMarks(view: EditorView, field: StateField<PreviewState>): DecorationSet {
  if (import.meta.env.DEV) performance.mark("basalt:buildTagMarks:start");
  const { collector, finish } = makeCollector();
  const ranges = view.state.field(field).codeBlockRanges;

  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(range.to);
    let line = startLine;
    while (line.number <= endLine.number) {
      if (line.text.includes("#")) {
        handleTagsInLine(line.from, line.text, ranges, collector);
      }
      if (line.number >= endLine.number || line.to >= view.state.doc.length)
        break;
      line = view.state.doc.lineAt(line.to + 1);
    }
  }
  if (import.meta.env.DEV) {
    performance.mark("basalt:buildTagMarks:end");
    performance.measure(
      "basalt:buildTagMarks",
      "basalt:buildTagMarks:start",
      "basalt:buildTagMarks:end",
    );
  }
  return finish();
}

export const tagMarksPlugin = (field: StateField<PreviewState>) =>
  ViewPlugin.fromClass(
    class extends TagMarksPlugin {
      constructor(view: EditorView) {
        super(view, field);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );