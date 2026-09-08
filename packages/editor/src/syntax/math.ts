import { styleTags, tags as t } from "@lezer/highlight";
import type {
  BlockContext,
  InlineContext,
  LeafBlock,
  MarkdownConfig,
} from "@lezer/markdown";

/**
 * Lezer Markdown grammar extension for LaTeX math syntax (ADR-039).
 *
 * Produces four node types:
 *   InlineMath     — full `$latex$` span (including delimiters)
 *   InlineMathMark — the `$` delimiter tokens around inline math
 *   BlockMath      — full `$$latex$$` or `$$\nlatex\n$$` block
 *   BlockMathMark  — the `$$` delimiter tokens around block math
 *
 * Design choices:
 * - Inline `$...$`: paired delimiters for inline math spans.
 *   Dollar amounts like `$100` are excluded (digit immediately after `$`).
 * - Display `$$...$$`: paired double-dollar delimiters for display math spans
 *   anywhere (paragraphs, callouts, blockquotes, lists).
 * - Multi-line `$$\n...\n$$`: also handled cleanly via paired delimiter resolution.
 */

// ---------------------------------------------------------------------------
// Math Delimiters
// ---------------------------------------------------------------------------

const InlineMathDelim = { resolve: "InlineMath", mark: "InlineMathMark" };
const BlockMathDelim = { resolve: "BlockMath", mark: "BlockMathMark" };

/** char code 36 = '$' */
const DOLLAR = 36;

/**
 * Math parser: handles both single `$` (inline) and double `$$` (display/block).
 * Uses cx.addDelimiter — the Lezer engine pairs openers and closers symmetrically
 * and wraps the content in InlineMath or BlockMath elements automatically.
 */
const mathParser = {
  name: "Math",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== DOLLAR) return -1;

    // Double dollar $$ (display math)
    if (cx.char(pos + 1) === DOLLAR) {
      return cx.addDelimiter(BlockMathDelim, pos, pos + 2, true, true);
    }

    // Single dollar $ (inline math)
    // Dollar amounts: "$100" should not open math (digit after $)
    const following = cx.char(pos + 1);
    if (following >= 48 && following <= 57) return -1; // '0'–'9'

    return cx.addDelimiter(InlineMathDelim, pos, pos + 1, true, true);
  },
  // Run after Emphasis so `_$x$_` → Emphasis wraps InlineMath correctly.
  after: "Emphasis",
};

// ---------------------------------------------------------------------------
// Standalone Leaf Block math fallback (for multi-line block syntax)
// ---------------------------------------------------------------------------

class BlockMathLeafParser {
  nextLine(_cx: BlockContext, _line: { text: string }, _leaf: LeafBlock): boolean {
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    const text = leaf.content.trim();
    if (!text.startsWith("$$") || !text.endsWith("$$") || text.length <= 4) {
      return false;
    }
    const innerStart = leaf.start + leaf.content.indexOf("$$");
    const innerEnd = leaf.start + leaf.content.lastIndexOf("$$") + 2;
    cx.addLeafElement(
      leaf,
      cx.elt("BlockMath", leaf.start, leaf.start + leaf.content.length, [
        cx.elt("BlockMathMark", innerStart, innerStart + 2),
        cx.elt("BlockMathMark", innerEnd - 2, innerEnd),
      ]),
    );
    return true;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The complete math MarkdownConfig — inline $...$ and block $$...$$.
 *
 * Register via `basaltSyntaxManifests` in `syntax/registry.ts` under id "math".
 */
export const mathMarkdownExtension: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: t.special(t.string) },
    { name: "InlineMathMark", style: t.processingInstruction },
    { name: "BlockMath", style: t.special(t.string), block: true },
    { name: "BlockMathMark", style: t.processingInstruction },
  ],
  parseInline: [mathParser],
  parseBlock: [
    {
      name: "BlockMath",
      leaf(_cx: BlockContext, leaf: LeafBlock) {
        return leaf.content.trim().startsWith("$$")
          ? new BlockMathLeafParser()
          : null;
      },
      before: "FencedCode",
    },
  ],
  props: [
    styleTags({
      InlineMathMark: t.processingInstruction,
      BlockMathMark: t.processingInstruction,
      "InlineMath/...": t.special(t.string),
      "BlockMath/...": t.special(t.string),
    }),
  ],
};
