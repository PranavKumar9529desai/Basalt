//! Match decorations: a single-line highlight marking the matched line plus
//! inline marks for each query hit, delivered through a decoded StateField so
//! the preview view can swap them per navigation.

import { Range, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { Highlight } from "../../types";

/** Line + inline highlights for the current match in the preview doc. */
export function buildDecorations(
  doc: Text,
  matchLine: number,
  highlights: Highlight[],
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lineNo = Math.max(1, Math.min(matchLine, doc.lines));
  const line = doc.line(lineNo);
  ranges.push(
    Decoration.line({
      attributes: {
        style:
          "background: color-mix(in srgb, var(--sat-accent-primary) 12%, transparent);",
      },
    }).range(line.from),
  );
  for (const h of [...highlights].sort((a, b) => a.start - b.start)) {
    const from = line.from + h.start;
    const to = line.from + h.end;
    if (from >= line.from && to <= line.to && from < to) {
      ranges.push(
        Decoration.mark({
          attributes: {
            style:
              "background: var(--sat-accent-primary); color: var(--sat-text-inverse); border-radius: 2px;",
          },
        }).range(from, to),
      );
    }
  }
  return Decoration.set(ranges);
}

export const setMatchDeco = StateEffect.define<DecorationSet>();

export const matchDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged) return value.map(tr.changes.desc);
    for (const e of tr.effects) {
      if (e.is(setMatchDeco)) return e.value;
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});