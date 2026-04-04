import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Extends the Lezer Markdown parser to recognize ==highlight== spans.
 * Defines two nodes:
 *   - `Highlight`: the full `==text==` span
 *   - `HighlightMark`: the `==` delimiter tokens
 */
export const highlightExtension: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: t.special(t.string) },
    { name: "HighlightMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx: InlineContext, next: number, pos: number): number {
        // 61 is '='
        if (next !== 61 || cx.char(pos + 1) !== 61) return -1;

        // Scan ahead for closing `==`
        for (let i = pos + 2; i < cx.end - 1; i++) {
          if (cx.char(i) === 61 && cx.char(i + 1) === 61) {
            return cx.addElement(
              cx.elt("Highlight", pos, i + 2, [
                cx.elt("HighlightMark", pos, pos + 2),
                cx.elt("HighlightMark", i, i + 2),
              ]),
            );
          }
          // No newlines inside highlights
          if (cx.char(i) === 10) break;
        }
        return -1;
      },
      before: "Emphasis",
    },
  ],
};
