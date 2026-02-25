import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

// Theme to style the autocomplete popup like Obsidian
export const SUGGESTIONS_THEME = EditorView.baseTheme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--sat-editor-popover-bg, #1e1e24)", // Match Obsidian dark mode
    border: "1px solid var(--sat-editor-popover-border, #333338)",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
    padding: "4px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
  },
  ".cm-tooltip-autocomplete > ul": {
    maxHeight: "300px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "6px 8px !important",
    borderRadius: "4px",
    lineHeight: "1.4",
    color: "var(--sat-editor-popover-text, #e2e8f0)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    position: "relative",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--sat-editor-popover-active-bg, #2d2d35) !important",
    color: "var(--sat-editor-popover-active-text, #ffffff) !important",
  },
  ".cm-completionIcon": {
    display: "none !important", // Hide the default Type icon (which displays as a missing glyph box)
  },
  ".cm-completionLabel": {
    fontSize: "14px",
    fontWeight: "500",
  },
  ".cm-completionDetail": {
    fontSize: "11px",
    color: "var(--sat-editor-popover-muted, #94a3b8)",
    marginTop: "2px",
    fontStyle: "normal",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    width: "100%",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--sat-editor-accent, #a78bfa)", // Highlight matching text in purple
  },
});

import type { FetchLinksFn, FetchTagsFn } from "../types";

export function createSuggestionsPlugin(
  onFetchLinks?: FetchLinksFn,
  onFetchTags?: FetchTagsFn,
) {
  return autocompletion({
    override: [
      async (context: CompletionContext): Promise<CompletionResult | null> => {
        // Link Completion [[...
        const linkMatch = context.matchBefore(/\[\[([^\]]*)/);
        if (linkMatch && onFetchLinks) {
          const query = linkMatch.text.slice(2);
          const results = await onFetchLinks(query);

          return {
            from: linkMatch.from + 2, // Start replacing after `[[`
            options: results.map(
              (res) =>
                ({
                  label: res.name,
                  type: "text",
                  apply: (view, _completion, from, to) => {
                    // If closeBrackets already inserted ]], don't add more —
                    // just replace [from, to) with the name and jump past the existing ]].
                    const after = view.state.doc.sliceString(to, to + 2);
                    const hasClosing = after === "]]";
                    const insert = hasClosing ? res.name : `${res.name}]]`;
                    view.dispatch({
                      changes: { from, to, insert },
                      selection: {
                        anchor: from + insert.length + (hasClosing ? 2 : 0),
                      },
                    });
                  },
                  detail: res.path,
                }) as Completion,
            ),
          };
        }

        // Tag Completion #...
        const tagMatch = context.matchBefore(/#([^\s]*)/);
        if (tagMatch && onFetchTags) {
          const query = tagMatch.text.slice(1); // skip `#`
          const results = await onFetchTags(query);

          return {
            from: tagMatch.from + 1, // Start replacing after `#`
            options: results.map(
              (res) =>
                ({
                  label: res,
                  type: "keyword",
                  apply: `${res} `,
                }) as Completion,
            ),
          };
        }

        return null;
      },
    ],
  });
}
