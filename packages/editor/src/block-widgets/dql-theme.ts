// ---------------------------------------------------------------------------
// Theme — uses --sat-* tokens only (ADR-002)
// ---------------------------------------------------------------------------

import { EditorView } from "@codemirror/view";

export const DQL_WIDGET_THEME = EditorView.baseTheme({
  ".cm-dql-result": {
    padding: "0.5em 0",
    fontSize: "0.9em",
    fontFamily: "inherit",
    position: "relative",
  },
  ".cm-dql-loading": {
    color: "var(--sat-text-secondary, #94a3b8)",
    fontStyle: "italic",
    padding: "0.25em 0",
  },
  ".cm-dql-error": {
    color: "var(--sat-state-error, #ef4444)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.85em",
    padding: "0.5em",
    backgroundColor: "var(--sat-surface-2, #1e1e2e)",
    borderRadius: "4px",
  },
  ".cm-dql-empty": {
    color: "var(--sat-text-secondary, #94a3b8)",
    fontStyle: "italic",
    padding: "0.25em 0",
  },
  ".cm-dql-table": {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "inherit",
  },
  ".cm-dql-th": {
    textAlign: "left",
    padding: "0.4em 0.8em",
    borderBottom: "2px solid var(--sat-layout-border, #334155)",
    color: "var(--sat-text-primary, #e2e8f0)",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  ".cm-dql-td": {
    padding: "0.35em 0.8em",
    borderBottom: "1px solid var(--sat-layout-border, #334155)",
    color: "var(--sat-text-secondary, #cbd5e1)",
    maxWidth: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-dql-td:hover": {
    whiteSpace: "normal",
    overflow: "visible",
  },
  ".cm-dql-link": {
    color: "var(--sat-accent-primary, #60a5fa)",
    textDecoration: "none",
    cursor: "pointer",
  },
  ".cm-dql-link:hover": {
    textDecoration: "underline",
  },
  ".cm-dql-list": {
    listStyle: "disc",
    paddingLeft: "1.5em",
    margin: "0",
  },
  ".cm-dql-list-item": {
    padding: "0.15em 0",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-dql-task-list": {
    listStyle: "none",
    paddingLeft: "0",
    margin: "0",
  },
  ".cm-dql-task-item": {
    padding: "0.15em 0",
    display: "flex",
    gap: "0.4em",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-dql-task-text": {
    color: "var(--sat-text-primary, #e2e8f0)",
  },
  ".cm-dql-check": {
    fontWeight: "bold",
  },
  ".cm-dql-check--on": {
    color: "var(--sat-state-success, #22c55e)",
  },
  ".cm-dql-check--off": {
    color: "var(--sat-text-muted, #64748b)",
  },
  ".cm-dql-date": {
    color: "var(--sat-accent-secondary, #a78bfa)",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-dql-null": {
    color: "var(--sat-text-muted, #64748b)",
    fontStyle: "italic",
  },
  ".cm-dql-footer": {
    paddingTop: "0.35em",
    fontSize: "0.8em",
    color: "var(--sat-text-muted, #64748b)",
  },
});
