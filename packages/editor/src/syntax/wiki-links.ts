import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/** Syntax node for the `!` prefix of an `![[embed]]` (sibling of its `WikiLink`). */
export const EMBED_MARK = "EmbedMark";

/**
 * Extends the Lezer Markdown parser to recognize [[WikiLinks]] and `![[Embeds]]`.
 * It defines three nodes:
 * 1. `WikiLink`: The parent node containing the entire link (e.g., `[[My Note]]`).
 * 2. `WikiLinkMark`: The syntax tokens (i.e., `[[` and `]]`).
 * 3. `EmbedMark`: The `!` prefix on `![[embed]]`, emitted as the sibling
 *    immediately before the `WikiLink` node.
 *
 * Why an explicit `![[` parser (ADR-033): the built-in `Image` parser swallows
 * `![` before the `WikiLink` (before: "Link") parser ever runs, so embeds never
 * produced a `WikiLink` node and `scanEmbedWikiLinks` found nothing. Matching
 * `![[` in a parser registered `before: "Image"` keeps `![alt](url)` images on
 * the `Image` path while making `![[target]]` a first-class link node.
 */
export const wikiLinkExtension: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "WikiLinkMark", style: t.processingInstruction },
    { name: EMBED_MARK, style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "WikiLink",
      parse(cx: InlineContext, next: number, pos: number): number {
        // Check for `[[` (91 is '[')
        if (next === 91 && cx.char(pos + 1) === 91) {
          // Scan ahead looking for `]]` (93 is ']')
          for (let i = pos + 2; i < cx.end; i++) {
            if (cx.char(i) === 93 && cx.char(i + 1) === 93) {
              return cx.addElement(
                cx.elt("WikiLink", pos, i + 2, [
                  cx.elt("WikiLinkMark", pos, pos + 2), // The opening `[[`
                  // Note: The text in between is automatically parsed as the content of the WikiLink
                  cx.elt("WikiLinkMark", i, i + 2), // The closing `]]`
                ]),
              );
            }
            // Stop parsing if we hit a newline (wikilinks are single-line)
            if (cx.char(i) === 10) {
              break;
            }
          }
        }
        return -1;
      },
      before: "Link", // Run before the standard Markdown link parser
    },
    {
      // `![[embed]]` — registered before `Image` so the built-in image parser
      // can't swallow the `!` and hide the wiki link (ADR-033).
      name: "WikilinkEmbed",
      before: "Image",
      parse(cx: InlineContext, next: number, pos: number): number {
        // '!'
        if (next !== 33) return -1;
        // Must be followed by `[[`
        if (cx.char(pos + 1) !== 91 || cx.char(pos + 2) !== 91) return -1;
        for (let i = pos + 3; i < cx.end; i++) {
          if (cx.char(i) === 93 && cx.char(i + 1) === 93) {
            // `!` is its own node; the WikiLink node spans `[[target]]` so the
            // existing scan (WikiLink preceded by `!`) keeps working unchanged.
            cx.addElement(cx.elt(EMBED_MARK, pos, pos + 1));
            return cx.addElement(
              cx.elt("WikiLink", pos + 1, i + 2, [
                cx.elt("WikiLinkMark", pos + 1, pos + 3), // The opening `[[`
                cx.elt("WikiLinkMark", i, i + 2), // The closing `]]`
              ]),
            );
          }
          // Stop parsing if we hit a newline (embeds are single-line)
          if (cx.char(i) === 10) {
            break;
          }
        }
        return -1;
      },
    },
  ],
};

/**
 * Adds an event listener to the editor that detects clicks on WikiLinks.
 * When a user clicks a WikiLink, it extracts the note name and calls `onOpenLink`.
 */
export function clickableLinksPlugin(onOpenLink?: (link: string) => void) {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!onOpenLink) return false;

      // Ensure it's a left click without modifier keys (optional but good practice)
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const tree = syntaxTree(view.state);
      // Resolve the innermost specific node at the click position
      let node = tree.resolveInner(pos, 1);

      // If we clicked exactly on the text inside the link, the node might be the parent WikiLink
      if (node.name !== "WikiLink" && node.parent?.name === "WikiLink") {
        node = node.parent;
      }

      if (node.name === "WikiLink") {
        // Extract the text content, slicing off the `[[` and `]]`
        const text = view.state.doc.sliceString(node.from + 2, node.to - 2);
        onOpenLink(text.trim());
        // Prevent default cursor movement if we are actually navigating
        event.preventDefault();
        return true;
      }

      return false;
    },
  });
}
