import { EditorView } from "@codemirror/view";

/**
 * Theme for Mermaid diagram block widgets (ADR-039).
 *
 * Key decisions:
 * - Container uses --sat-surface-2 / --sat-layout-border for consistency with
 *   other block widgets (HTML, DQL, table).
 * - `.cm-mermaid-svg svg` forces max-width: 100% — fixing the #1 Obsidian
 *   Mermaid complaint (SVGs that overflow their containers and require manual
 *   CSS snippets to fix).
 * - Error state uses --sat-state-error (same as DQL error styling).
 */
export const MERMAID_WIDGET_THEME = EditorView.baseTheme({
  ".cm-mermaid-container": {
    position: "relative",
    background: "var(--sat-surface-2, rgba(255,255,255,0.03))",
    border: "1px solid var(--sat-layout-border, rgba(255,255,255,0.08))",
    borderRadius: "8px",
    padding: "1rem",
    margin: "0.5rem 0",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  ".cm-mermaid-svg": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    overflow: "hidden",
  },
  // The SVG element itself must also be constrained — Mermaid sometimes sets
  // an explicit width attribute on the <svg> that overrides CSS max-width
  // unless targeted specifically.
  ".cm-mermaid-svg svg": {
    maxWidth: "100% !important",
    height: "auto !important",
    display: "block",
  },
  ".cm-mermaid-loading": {
    color: "var(--sat-text-muted, #64748b)",
    fontSize: "0.85em",
    padding: "0.5rem 0",
    fontStyle: "italic",
  },
  ".cm-mermaid-error": {
    color: "var(--sat-state-error, #f87171)",
    fontSize: "0.85em",
    fontFamily: "var(--sat-font-mono)",
    whiteSpace: "pre-wrap",
    padding: "0.5rem 0",
  },
});
