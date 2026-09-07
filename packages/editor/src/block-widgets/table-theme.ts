// ---------------------------------------------------------------------------
// Theme — baseTheme CSS and CM6 style/decoration data for TableBlockWidget
// ---------------------------------------------------------------------------

import { EditorView } from "@codemirror/view";

export const TABLE_BLOCK_THEME = EditorView.baseTheme({
  ".cm-table-block": {
    position: "relative",
    padding: "0.5rem 0",
    overflowX: "auto",
  },
  ".cm-table-block table.cm-table-rendered": {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "0.9em",
    margin: "0.25rem 0",
  },
  ".cm-table-block th": {
    fontWeight: "700",
    textAlign: "left",
    padding: "0.4rem 0.75rem",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
    color: "var(--sat-table-header-color, #e2e8f0)",
    whiteSpace: "nowrap",
  },
  ".cm-table-block td": {
    padding: "0.35rem 0.75rem",
    borderBottom: "1px solid var(--sat-layout-divider, rgba(255,255,255,0.06))",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  ".cm-table-block .cm-table-media": {
    maxWidth: "100%",
    maxHeight: "360px",
    borderRadius: "var(--sat-layout-radius-md, 6px)",
    verticalAlign: "middle",
    whiteSpace: "normal",
  },
  ".cm-table-block img.cm-table-media": {
    cursor: "pointer",
  },
  ".cm-table-block tr.cm-table-row-alt td": {
    background: "var(--sat-surface-2, rgba(255,255,255,0.02))",
  },
  ".cm-table-block .cm-table-link": {
    color: "var(--sat-accent-primary, #60a5fa)",
    cursor: "pointer",
  },
  ".cm-table-block .cm-table-link:hover": {
    textDecoration: "underline",
  },
  ".cm-table-btn-code": {
    position: "absolute",
    top: "6px",
    right: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "var(--sat-layout-radius-md, 6px)",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.08))",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.12))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    opacity: "0",
    transition:
      "opacity 150ms ease, color 150ms ease, background-color 150ms ease",
    zIndex: "10",
  },
  ".cm-table-container:hover .cm-table-btn-code, .cm-table-container:focus-within .cm-table-btn-code":
    {
      opacity: "1",
    },
  ".cm-table-btn-code:hover": {
    color: "var(--sat-text-primary, #f8fafc)",
    background: "var(--sat-surface-3, rgba(255, 255, 255, 0.16))",
  },
  ".cm-table-container": {
    position: "relative",
    display: "inline-block",
    minWidth: "100%",
    paddingBottom: "0",
    transition: "padding-bottom 120ms ease",
  },
  ".cm-table-container.cm-zone-row-active, .cm-table-container.cm-zone-col-active":
    {
      paddingBottom: "24px",
    },
  ".cm-table-ghost-col-cell": {
    display: "none",
    width: "28px",
    minWidth: "28px",
    maxWidth: "28px",
    padding: "0",
    boxSizing: "border-box",
  },
  ".cm-zone-col-active .cm-table-ghost-col-cell": {
    display: "table-cell",
  },
  ".cm-zone-col-active .cm-table-ghost-col-th": {
    borderLeft: "1px solid var(--sat-table-border, #334155)",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
    borderRight:
      "1px dashed var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
    borderTop: "1px dashed var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
  },
  ".cm-zone-col-active .cm-table-ghost-col-td": {
    borderLeft: "1px solid var(--sat-table-border, #334155)",
    borderBottom:
      "1px solid var(--sat-layout-divider, rgba(255, 255, 255, 0.06))",
    borderRight:
      "1px dashed var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
  },
  ".cm-table-ghost-row": {
    display: "none",
  },
  ".cm-zone-row-active .cm-table-ghost-row": {
    display: "table-row",
  },
  ".cm-zone-row-active .cm-table-ghost-row td": {
    height: "26px",
    padding: "0",
    borderBottom:
      "1px dashed var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
    borderRight: "1px solid var(--sat-table-border, #334155)",
    borderLeft: "1px solid var(--sat-table-border, #334155)",
    boxSizing: "border-box",
  },
  ".cm-table-ghost-btn-col": {
    position: "absolute",
    right: "4px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "20px",
    height: "20px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.08))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    transition:
      "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    zIndex: "10",
  },
  ".cm-zone-col-active .cm-table-ghost-btn-col": {
    display: "flex",
  },
  ".cm-table-ghost-btn-col:hover": {
    background: "var(--sat-accent-primary, #60a5fa)",
    color: "var(--sat-surface-1, #0f172a)",
    borderColor: "var(--sat-accent-primary, #60a5fa)",
  },
  ".cm-table-ghost-label-col": {
    position: "absolute",
    right: "0",
    bottom: "4px",
    fontSize: "0.75rem",
    color: "var(--sat-text-muted, #94a3b8)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    display: "none",
    textAlign: "right",
  },
  ".cm-table-ghost-label-col.visible": {
    display: "block",
  },
  ".cm-table-ghost-btn-row": {
    position: "absolute",
    left: "50%",
    bottom: "27px",
    transform: "translateX(-50%)",
    width: "20px",
    height: "20px",
    borderRadius: "var(--sat-layout-radius-sm, 4px)",
    border: "1px solid var(--sat-layout-border, rgba(255, 255, 255, 0.2))",
    background: "var(--sat-surface-2, rgba(255, 255, 255, 0.08))",
    color: "var(--sat-text-muted, #94a3b8)",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    transition:
      "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    zIndex: "10",
  },
  ".cm-zone-row-active .cm-table-ghost-btn-row": {
    display: "flex",
  },
  ".cm-table-ghost-btn-row:hover": {
    background: "var(--sat-accent-primary, #60a5fa)",
    color: "var(--sat-surface-1, #0f172a)",
    borderColor: "var(--sat-accent-primary, #60a5fa)",
  },
  ".cm-table-ghost-label-row": {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    bottom: "4px",
    fontSize: "0.75rem",
    color: "var(--sat-text-muted, #94a3b8)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    display: "none",
    textAlign: "center",
  },
  ".cm-table-ghost-label-row.visible": {
    display: "block",
  },
  '.cm-table-block th[contenteditable="plaintext-only"]:focus, .cm-table-block td[contenteditable="plaintext-only"]:focus, .cm-table-block th[contenteditable="true"]:focus, .cm-table-block td[contenteditable="true"]:focus':
    {
      outline: "2px solid var(--sat-accent-primary, #60a5fa)",
      outlineOffset: "-1px",
      background: "var(--sat-surface-2, rgba(255, 255, 255, 0.04))",
      borderRadius: "2px",
    },
});
