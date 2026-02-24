import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Extends the Lezer Markdown parser to recognize [[WikiLinks]].
 * It defines two nodes:
 * 1. `WikiLink`: The parent node containing the entire link (e.g., `[[My Note]]`).
 * 2. `WikiLinkMark`: The syntax tokens (i.e., `[[` and `]]`).
 */
export const wikiLinkExtension: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "WikiLinkMark", style: t.processingInstruction },
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
