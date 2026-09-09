import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

/**
 * Extends the Lezer Markdown parser to recognize ==highlight== spans.
 *
 * Uses Lezer's delimiter pairing API (`addDelimiter`) with a same-line lookahead
 * guard so that:
 * 1. Highlights are strictly single-line (cannot span newlines, matching Obsidian).
 * 2. Nested inline tokens (such as inline math `$E=mc^2$`, `**bold**`,
 *    `*italic*`, `[[wikilinks]]`, etc.) are parsed recursively as proper child nodes.
 *
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

        // Scan ahead on the current line to check if a matching closer exists.
        // If there is a newline before the next ==, canOpen is false (enforcing single-line).
        let hasCloserAhead = false;
        for (let i = pos + 2; i < cx.end - 1; i++) {
          if (cx.char(i) === 10) break; // newline aborts
          if (cx.char(i) === 61 && cx.char(i + 1) === 61) {
            hasCloserAhead = true;
            break;
          }
        }

        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          hasCloserAhead,
          true,
        );
      },
      after: "Emphasis",
    },
  ],
};
