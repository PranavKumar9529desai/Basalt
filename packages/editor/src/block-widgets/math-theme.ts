import { EditorView } from "@codemirror/view";

/**
 * Theme for Math (KaTeX) block and inline widgets (ADR-039).
 *
 * Uses Basalt's `--sat-*` design tokens:
 * - `.cm-math-block` centered display math with horizontal scroll if needed
 * - `.cm-math-inline` inline math styling matching surrounding text
 * - KaTeX color overrides via `--sat-text-primary` and `--sat-state-error`
 */
export const MATH_WIDGET_THEME = EditorView.baseTheme({
  ".cm-math-block": {
    display: "block",
    textAlign: "center",
    padding: "0.75rem 0",
    margin: "0.5rem 0",
    overflowX: "auto",
    overflowY: "hidden",
    boxSizing: "border-box",
  },
  ".cm-math-inline": {
    display: "inline",
    verticalAlign: "baseline",
  },
  ".cm-math-loading": {
    color: "var(--sat-text-muted, #64748b)",
    fontSize: "0.85em",
    fontStyle: "italic",
    padding: "0 0.25rem",
  },
  ".cm-math-error": {
    color: "var(--sat-state-error, #f87171)",
    fontSize: "0.85em",
    fontFamily: "var(--sat-font-mono)",
    cursor: "help",
  },
  // Ensure KaTeX typography uses theme variables
  ".katex": {
    fontSize: "1.05em",
    color: "var(--sat-text-primary)",
  },
  ".katex-display": {
    margin: "0 !important",
  },
});
