import { EditorView } from "@codemirror/view";

/**
 * Find & Replace panel styling — CM6's default `.cm-search` is light-gray
 * chrome that clashes with the dark shell. Tokens-only (ADR-002), no raw
 * color literals.
 */
export const SEARCH_PANEL_THEME = EditorView.baseTheme({
  "&.cm-focused .cm-search": {
    backgroundColor: "var(--sat-surface-2)",
    color: "var(--sat-text-primary)",
    border: "1px solid var(--sat-layout-border)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  },
  ".cm-search": {
    top: "6px",
    left: "6px",
    right: "auto",
    zIndex: 10,
  },
  ".cm-search input": {
    backgroundColor: "transparent",
    color: "var(--sat-text-primary)",
    outline: "none",
  },
  ".cm-search input:focus": {
    outline: "1px solid var(--sat-accent-primary, #6366f1)",
  },
  ".cm-search button": {
    color: "var(--sat-text-secondary)",
    backgroundColor: "transparent",
    backgroundImage: "none",
    border: "none",
    fontSize: "0.75rem",
  },
  ".cm-search button:hover": {
    color: "var(--sat-text-primary)",
    backgroundColor: "var(--sat-surface-3, rgba(255,255,255,0.06))",
  },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "var(--sat-text-muted)",
  },
  ".cm-search .cm-textfield": {
    border: "1px solid var(--sat-layout-border)",
    borderRadius: "4px",
    padding: "2px 6px",
  },
  ".cm-search-match": {
    backgroundColor: "var(--sat-highlight-bg, rgba(234,179,8,0.25))",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "var(--sat-accent-primary-muted, rgba(99,102,241,0.35))",
  },
});