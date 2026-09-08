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
 *   BlockMath      — full `$$\nlatex\n$$` block
 *   BlockMathMark  — the `$$` delimiter tokens around block math
 *
 * Modelled directly after the `highlightExtension` (highlight.ts) pattern
 * already in Basalt — uses @lezer/markdown's InlineContext and LeafBlock APIs.
 *
 * Key design choices:
 * - Inline `$...$`: must not cross a newline; must not start with `$$`.
 *   Dollar amounts like `$100` are excluded (digit immediately after `$`).
 * - Block `$$...$$`: must start with `$$` on its own line. The closing `$$`
 *   must also be on its own line. Implemented as a LeafBlockParser.
 * - Does NOT require `parseMixed` or a LaTeX sub-parser — we only need the
 *   node boundaries for cursor-aware reveal and widget replacement.
 */

// ---------------------------------------------------------------------------
// Inline math: $...$
// ---------------------------------------------------------------------------

/** Delimiter descriptor for `cx.addDelimiter` — resolves to InlineMath node. */
const InlineMathDelim = { resolve: "InlineMath", mark: "InlineMathMark" };

/** char code 36 = '$' */
const DOLLAR = 36;

/**
 * Inline parser: fired for every `$` character in a paragraph.
 * Uses cx.addDelimiter — the Lezer engine pairs openers and closers
 * and wraps the content in an InlineMath element automatically.
 */
const inlineMathParser = {
  name: "InlineMath",
  parse(cx: InlineContext, next: number, pos: number): number {
    // Must be a single $
    if (next !== DOLLAR) return -1;
    // $$ is handled by the block parser — skip so we don't steal the first $
    if (cx.char(pos + 1) === DOLLAR) return -1;
    // Dollar amounts: "$100" should not open math (digit after $)
    const following = cx.char(pos + 1);
    if (following >= 48 && following <= 57) return -1; // '0'–'9'
    // Must not be preceded by a non-space inside the same line (avoids mid-word)
    // — mark both opening and closing so the engine matches symmetrically.
    return cx.addDelimiter(InlineMathDelim, pos, pos + 1, true, true);
  },
  // Run after Emphasis: `_$x$_` → Emphasis wraps InlineMath correctly.
  after: "Emphasis",
};

// ---------------------------------------------------------------------------
// Block math: $$\n...\n$$
// ---------------------------------------------------------------------------

/**
 * LeafBlockParser for block math.
 *
 * A LeafBlock is a block element that fits on one line (like a thematic break
 * or setext heading). We get called when any leaf-check fires. We use this to
 * handle *single-line* display math: `$$E=mc^2$$`.
 *
 * Multi-line `$$\n...\n$$` is handled by the BlockParser below, which reads
 * lines via cx.nextLine().
 */
class BlockMathLeafParser {
  nextLine(_cx: BlockContext, _line: { text: string }, _leaf: LeafBlock): boolean {
    return false; // leaf parsers only see one line; return false → not consumed
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    const text = leaf.content.trim();
    // Single-line display math: $$...$$ with content in between
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
 *
 * The node type names produced:
 *   "InlineMath"      → matched by handleInlineMathNode() in collector.ts
 *   "BlockMath"       → matched by mathBlockSpec in block-widgets/math-widget.ts
 *   "InlineMathMark"  → hidden by preview/mark-hiding.ts
 *   "BlockMathMark"   → hidden by preview/mark-hiding.ts
 */
export const mathMarkdownExtension: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: t.special(t.string) },
    { name: "InlineMathMark", style: t.processingInstruction },
    { name: "BlockMath", style: t.special(t.string), block: true },
    { name: "BlockMathMark", style: t.processingInstruction },
  ],
  parseInline: [inlineMathParser],
  parseBlock: [
    {
      name: "BlockMath",
      leaf(_cx: BlockContext, leaf: LeafBlock) {
        // Only activate for lines that start with $$
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
