import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

const CALLOUT_ALIASES: Record<string, string> = {
  note: "note",
  abstract: "abstract", summary: "abstract", tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  question: "question", help: "question", faq: "question",
  warning: "warning", caution: "warning", attention: "warning",
  failure: "failure", fail: "failure", missing: "failure",
  danger: "danger", error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote", cite: "quote",
};

const CALLOUT_ICONS: Record<string, string> = {
  note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  abstract: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  todo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  question: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  failure: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  danger: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  bug: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
  example: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  quote: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`,
};

const CALLOUT_RE = /^>\s*\[!([a-zA-Z]+)\]([+-]?)(?:\s+(.*))?$/;

const CALLOUT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  note:     { border: "var(--sat-callout-note-border, #3b82f6)",     bg: "var(--sat-callout-note-bg, rgba(59,130,246,0.18))",     icon: "var(--sat-callout-note-icon, #93c5fd)" },
  abstract: { border: "var(--sat-callout-abstract-border, #06b6d4)", bg: "var(--sat-callout-abstract-bg, rgba(6,182,212,0.18))",  icon: "var(--sat-callout-abstract-icon, #67e8f9)" },
  info:     { border: "var(--sat-callout-info-border, #3b82f6)",     bg: "var(--sat-callout-info-bg, rgba(59,130,246,0.18))",     icon: "var(--sat-callout-info-icon, #93c5fd)" },
  todo:     { border: "var(--sat-callout-todo-border, #3b82f6)",     bg: "var(--sat-callout-todo-bg, rgba(59,130,246,0.18))",     icon: "var(--sat-callout-todo-icon, #93c5fd)" },
  tip:      { border: "var(--sat-callout-tip-border, #0ea5e9)",      bg: "var(--sat-callout-tip-bg, rgba(14,165,233,0.18))",      icon: "var(--sat-callout-tip-icon, #7dd3fc)" },
  success:  { border: "var(--sat-callout-success-border, #22c55e)",  bg: "var(--sat-callout-success-bg, rgba(34,197,94,0.18))",   icon: "var(--sat-callout-success-icon, #86efac)" },
  question: { border: "var(--sat-callout-question-border, #eab308)", bg: "var(--sat-callout-question-bg, rgba(234,179,8,0.18))",  icon: "var(--sat-callout-question-icon, #fde047)" },
  warning:  { border: "var(--sat-callout-warning-border, #f97316)",  bg: "var(--sat-callout-warning-bg, rgba(249,115,22,0.18))",  icon: "var(--sat-callout-warning-icon, #fdba74)" },
  failure:  { border: "var(--sat-callout-failure-border, #ef4444)",  bg: "var(--sat-callout-failure-bg, rgba(239,68,68,0.18))",   icon: "var(--sat-callout-failure-icon, #fca5a5)" },
  danger:   { border: "var(--sat-callout-danger-border, #ef4444)",   bg: "var(--sat-callout-danger-bg, rgba(239,68,68,0.18))",    icon: "var(--sat-callout-danger-icon, #fca5a5)" },
  bug:      { border: "var(--sat-callout-bug-border, #ef4444)",      bg: "var(--sat-callout-bug-bg, rgba(239,68,68,0.18))",       icon: "var(--sat-callout-bug-icon, #fca5a5)" },
  example:  { border: "var(--sat-callout-example-border, #a855f7)",  bg: "var(--sat-callout-example-bg, rgba(168,85,247,0.18))",  icon: "var(--sat-callout-example-icon, #d8b4fe)" },
  quote:    { border: "var(--sat-callout-quote-border, #94a3b8)",    bg: "var(--sat-callout-quote-bg, rgba(148,163,184,0.18))",   icon: "var(--sat-callout-quote-icon, #cbd5e1)" },
};

export const CALLOUTS_THEME = EditorView.baseTheme({
  ".cm-live-callout": {
    paddingLeft: "1rem",
  },
  ".cm-callout-header": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "6px 6px 0 0",
    fontWeight: "600",
    fontSize: "0.9rem",
    userSelect: "none",
    cursor: "default",
  },
  ".cm-callout-header svg": {
    flexShrink: "0",
  },
  ".cm-callout-fold": {
    marginLeft: "auto",
    opacity: "0.6",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  ".cm-line.cm-live-callout-note":     { borderLeft: "3px solid var(--sat-callout-note-border, #3b82f6)",     backgroundColor: "var(--sat-callout-note-bg, rgba(59,130,246,0.12))" },
  ".cm-line.cm-live-callout-abstract": { borderLeft: "3px solid var(--sat-callout-abstract-border, #06b6d4)", backgroundColor: "var(--sat-callout-abstract-bg, rgba(6,182,212,0.12))" },
  ".cm-line.cm-live-callout-info":     { borderLeft: "3px solid var(--sat-callout-info-border, #3b82f6)",     backgroundColor: "var(--sat-callout-info-bg, rgba(59,130,246,0.12))" },
  ".cm-line.cm-live-callout-todo":     { borderLeft: "3px solid var(--sat-callout-todo-border, #3b82f6)",     backgroundColor: "var(--sat-callout-todo-bg, rgba(59,130,246,0.12))" },
  ".cm-line.cm-live-callout-tip":      { borderLeft: "3px solid var(--sat-callout-tip-border, #0ea5e9)",      backgroundColor: "var(--sat-callout-tip-bg, rgba(14,165,233,0.12))" },
  ".cm-line.cm-live-callout-success":  { borderLeft: "3px solid var(--sat-callout-success-border, #22c55e)",  backgroundColor: "var(--sat-callout-success-bg, rgba(34,197,94,0.12))" },
  ".cm-line.cm-live-callout-question": { borderLeft: "3px solid var(--sat-callout-question-border, #eab308)", backgroundColor: "var(--sat-callout-question-bg, rgba(234,179,8,0.12))" },
  ".cm-line.cm-live-callout-warning":  { borderLeft: "3px solid var(--sat-callout-warning-border, #f97316)",  backgroundColor: "var(--sat-callout-warning-bg, rgba(249,115,22,0.12))" },
  ".cm-line.cm-live-callout-failure":  { borderLeft: "3px solid var(--sat-callout-failure-border, #ef4444)",  backgroundColor: "var(--sat-callout-failure-bg, rgba(239,68,68,0.12))" },
  ".cm-line.cm-live-callout-danger":   { borderLeft: "3px solid var(--sat-callout-danger-border, #ef4444)",   backgroundColor: "var(--sat-callout-danger-bg, rgba(239,68,68,0.12))" },
  ".cm-line.cm-live-callout-bug":      { borderLeft: "3px solid var(--sat-callout-bug-border, #ef4444)",      backgroundColor: "var(--sat-callout-bug-bg, rgba(239,68,68,0.12))" },
  ".cm-line.cm-live-callout-example":  { borderLeft: "3px solid var(--sat-callout-example-border, #a855f7)",  backgroundColor: "var(--sat-callout-example-bg, rgba(168,85,247,0.12))" },
  ".cm-line.cm-live-callout-quote":    { borderLeft: "3px solid var(--sat-callout-quote-border, #94a3b8)",    backgroundColor: "var(--sat-callout-quote-bg, rgba(148,163,184,0.12))" },
});

export class CalloutHeaderWidget extends WidgetType {
  constructor(
    private readonly type: string,
    private readonly title: string,
    private readonly fold: string,
  ) {
    super();
  }

  eq(other: CalloutHeaderWidget) {
    return (
      other.type === this.type &&
      other.title === this.title &&
      other.fold === this.fold
    );
  }

  toDOM() {
    const canonical = CALLOUT_ALIASES[this.type.toLowerCase()] ?? "note";
    const icon = CALLOUT_ICONS[canonical] ?? CALLOUT_ICONS.note;
    const colors = CALLOUT_COLORS[canonical] ?? CALLOUT_COLORS.note;

    const header = document.createElement("div");
    header.className = "cm-callout-header";
    header.style.backgroundColor = colors.bg;
    header.style.borderLeft = `3px solid ${colors.border}`;
    header.style.color = colors.icon;

    header.innerHTML = icon;

    const titleSpan = document.createElement("span");
    titleSpan.textContent =
      this.title || canonical.charAt(0).toUpperCase() + canonical.slice(1);
    header.appendChild(titleSpan);

    if (this.fold !== "") {
      const foldBtn = document.createElement("span");
      foldBtn.className = "cm-callout-fold";
      foldBtn.textContent = this.fold === "+" ? "▾" : "▸";
      header.appendChild(foldBtn);
    }

    header.contentEditable = "false";
    return header;
  }

  ignoreEvent() {
    return true;
  }
}

export function handleCalloutNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "BlockQuote") return false;

  const doc = ctx.view.state.doc;
  const firstLine = doc.lineAt(node.from);
  const match = CALLOUT_RE.exec(firstLine.text);
  if (!match) return false;

  const rawType = match[1];
  const fold = match[2] ?? "";
  const title = match[3] ?? "";
  const canonical = CALLOUT_ALIASES[rawType.toLowerCase()] ?? "note";

  const hasCursor = ctx.headPos >= firstLine.from && ctx.headPos <= firstLine.to;
  const endLine = doc.lineAt(node.to);

  for (let ln = firstLine.number; ln <= endLine.number; ln++) {
    // Skip adding a line class to the first line when it will be replaced by
    // the header widget — CodeMirror cannot have both a Decoration.line and a
    // block Decoration.replace on the same line position.
    if (!hasCursor && ln === firstLine.number) continue;
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-callout");
    collector.addLineClass(line.from, `cm-live-callout-${canonical}`);
  }

  if (!hasCursor) {
    collector.addReplace(
      firstLine.from,
      firstLine.to,
      new CalloutHeaderWidget(rawType, title, fold),
      true,
    );
  }

  return true;
}
