import { EditorView } from "@codemirror/view";
import { TASK_CHECKBOX_STYLE } from "../styling/task-checkbox";

export const TASK_WIDGET_THEME = EditorView.baseTheme({
  ".cm-task-result": {
    position: "relative",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--sat-layout-border, #334155)",
    backgroundColor: "var(--sat-surface-2, #0f172a)",
    marginBottom: "4px",
  },
  ".cm-task-loading, .cm-task-empty": {
    color: "var(--sat-text-muted, #94a3b8)",
    fontSize: "13px",
    padding: "4px 0",
  },
  ".cm-task-error": {
    color: "var(--sat-state-error, #f87171)",
    fontSize: "13px",
    padding: "4px 0",
  },
  ".cm-task-list": {
    listStyle: "none",
    margin: "0",
    padding: "0",
  },
  ".cm-task-item": {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "3px 0",
    fontSize: "13px",
  },
  // Task status box — CSS-drawn checkbox shared with the inline editor
  // (see src/styling/task-checkbox.ts). Static (not clickable) here.
  ".cm-task-item .cm-task-checkbox": {
    marginTop: "3px",
    cursor: "default",
  },
  ...TASK_CHECKBOX_STYLE,
  ".cm-task-body": {
    flex: "1 1 auto",
    minWidth: "0",
  },
  ".cm-task-desc": {
    color: "var(--sat-text-primary, #e2e8f0)",
  },
  ".cm-task-chips": {
    display: "inline-flex",
    flexWrap: "wrap",
    gap: "4px",
    marginLeft: "8px",
  },
  ".cm-task-chip": {
    borderRadius: "4px",
    padding: "0 6px",
    fontSize: "11px",
    lineHeight: "18px",
    whiteSpace: "nowrap",
    backgroundColor: "var(--sat-surface-3, #1e293b)",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-task-priority--highest": {
    color: "var(--sat-state-error, #f87171)",
  },
  ".cm-task-priority--high": {
    color: "#fb923c",
  },
  ".cm-task-priority--medium": {
    color: "var(--sat-accent-primary, #3b82f6)",
  },
  ".cm-task-priority--low": {
    color: "#a3e635",
  },
  ".cm-task-priority--lowest": {
    color: "var(--sat-text-muted, #94a3b8)",
  },
  ".cm-task-date--due": {
    color: "#facc15",
  },
  ".cm-task-date--scheduled": {
    color: "var(--sat-accent-secondary, #8b5cf6)",
  },
  ".cm-task-tag": {
    color: "var(--sat-accent-primary, #3b82f6)",
  },
  ".cm-task-urgency": {
    color: "var(--sat-text-muted, #94a3b8)",
  },
  ".cm-task-file": {
    flexShrink: "0",
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-task-backlink": {
    color: "var(--sat-text-muted, #94a3b8)",
    textDecoration: "none",
    cursor: "pointer",
  },
  ".cm-task-backlink:hover": {
    textDecoration: "underline",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-task-group-title": {
    margin: "6px 0 2px",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--sat-text-secondary, #cbd5e1)",
  },
  ".cm-task-group-count": {
    color: "var(--sat-text-muted, #94a3b8)",
    fontWeight: "400",
  },
  ".cm-task-footer": {
    marginTop: "6px",
    paddingTop: "4px",
    borderTop: "1px solid var(--sat-layout-border, #334155)",
    color: "var(--sat-text-muted, #94a3b8)",
    fontSize: "11px",
  },
  ".cm-task-unsupported": {
    marginTop: "6px",
    color: "var(--sat-state-warning, #fbbf24)",
    fontSize: "11px",
  },
});