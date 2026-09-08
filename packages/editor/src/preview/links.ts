import type { Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { openLinkFacet } from "../block-widgets/dql-widget";
import {
  normalizeWikiLinkTarget,
  targetFromWikiLinkNode,
} from "../syntax/wiki-links";
import { openTagFacet, openExternalLinkFacet } from "../types";
/**
 * ViewPlugin that intercepts clicks on wikilinks, markdown links, and
 * `.cm-table-link[data-name]` widgets in reading mode, navigating via
 * `openLinkFacet`. Uses event delegation on `.cm-content` — one listener for
 * all link types. Wikilink targets are sliced from the syntax tree so the
 * `[[`/`]]` brackets never reach the lookup (ADR-034 part D).
 */
export function readingLinkHandler(): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
      const target = event.target as HTMLElement | null;
      if (!target) return false;

      // Videos/audios own their clicks (playback controls) — never navigate.
      if (target.closest?.("video, audio")) return false;

      // Rich table cells and media embeds carry .cm-table-link[data-name].
      const tableLink = target.closest?.(".cm-table-link");
      if (tableLink) {
        const name = tableLink.getAttribute("data-name")?.trim();
        if (name) {
          const onOpenLink = view.state.facet(openLinkFacet);
          onOpenLink?.(name);
          return true;
        }
      }

      // Tag pill: `.cm-live-tag` spans exactly `#tag` — strip the `#` (tags
      // are plain text, not tree nodes, so the span carries the answer).
      const tagSpan = target.closest?.(".cm-live-tag");
      if (tagSpan) {
        const text = (tagSpan.textContent ?? "").trim();
        const tag = text.startsWith("#") ? text.slice(1) : text;
        if (tag) {
          view.state.facet(openTagFacet)?.(tag);
          return true;
        }
      }

      // Wikilink: .cm-live-wikilink spans. Resolve the span's doc position to
      // a WikiLink syntax node and slice the brackets via its syntax offsets.
      const wikiSpan = target.closest?.(".cm-live-wikilink");
      if (wikiSpan) {
        const text = wikiLinkTargetAt(view, event) ?? "";
        if (text) {
          const onOpenLink = view.state.facet(openLinkFacet);
          onOpenLink?.(text);
          return true;
        }
      }
      // Markdown link: <a> elements with href
      const anchor = target.closest?.("a");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href?.startsWith("#")) return false; // internal anchor, don't intercept
        if (href?.startsWith("http")) {
          // Routed through the injected opener (Tauri system browser) — never
          // window.open inside the WebView.
          view.state.facet(openExternalLinkFacet)?.(href);
          return true;
        }
        // Wikilink rendered as <a> by block widgets (DQL results etc.)
        const name =
          anchor.getAttribute("data-name") ?? anchor.textContent ?? "";
        if (name) {
          const onOpenLink = view.state.facet(openLinkFacet);
          onOpenLink?.(name.trim());
          return true;
        }
      }

      return false;
    },
  });
}

/**
 * Resolve the wikilink target under a click. Primary path: map the event
 * coordinates to a doc position and slice `[[`/`]]` via the WikiLink syntax
 * node. Fallback (coordinate-less environments / widget boundaries): strip the
 * brackets from the mark's own text content and normalize the same way.
 */
function wikiLinkTargetAt(view: EditorView, event: MouseEvent): string | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos !== null) {
    const tree = syntaxTree(view.state);
    let node = tree.resolveInner(pos, 1);
    if (node.name !== "WikiLink" && node.parent?.name === "WikiLink") {
      node = node.parent;
    }
    const viaSyntax = targetFromWikiLinkNode(view.state, node);
    if (viaSyntax) return viaSyntax;
  }
  const text = (event.target as HTMLElement | null)?.textContent ?? "";
  return normalizeWikiLinkTarget(
    text.replace(/^\[\[/, "").replace(/\]\]$/, ""),
  );
}
