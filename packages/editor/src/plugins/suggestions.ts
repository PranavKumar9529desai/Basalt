import { autocompletion, CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

// Theme to style the autocomplete popup like Obsidian
export const SUGGESTIONS_THEME = EditorView.baseTheme({
    ".cm-tooltip-autocomplete": {
        backgroundColor: "#1e1e24", // Match Obsidian dark mode 
        border: "1px solid #333338",
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
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "#2d2d35 !important",
        color: "#ffffff !important",
    },
    ".cm-completionIcon": {
        display: "none", // Hide the default Type icon
    },
    ".cm-completionLabel": {
        fontSize: "14px",
        fontWeight: "500",
    },
    ".cm-completionDetail": {
        fontSize: "11px",
        color: "#94a3b8",
        marginTop: "2px",
        fontStyle: "normal",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        width: "100%",
    },
    ".cm-completionMatchedText": {
        textDecoration: "none",
        color: "#a78bfa", // Highlight matching text in purple
    }
});

export type FetchLinksFn = (query: string) => Promise<Array<{ name: string; path: string }>>;
export type FetchTagsFn = (query: string) => Promise<string[]>;

export function createSuggestionsPlugin(onFetchLinks?: FetchLinksFn, onFetchTags?: FetchTagsFn) {
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
                        options: results.map((res) => ({
                            label: res.name,
                            type: "text",
                            apply: `${res.name}]]`,
                            detail: res.path,
                        } as Completion))
                    };
                }

                // Tag Completion #...
                const tagMatch = context.matchBefore(/#([^\s]*)/);
                if (tagMatch && onFetchTags) {
                    const query = tagMatch.text.slice(1); // skip `#`
                    const results = await onFetchTags(query);

                    return {
                        from: tagMatch.from + 1, // Start replacing after `#`
                        options: results.map((res) => ({
                            label: res,
                            type: "keyword",
                            apply: `${res} `,
                            detail: "Tag"
                        } as Completion))
                    };
                }

                return null;
            }
        ]
    });
}
