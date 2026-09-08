import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";
import { CALLOUT_ALIASES, CALLOUT_COLORS, CALLOUT_ICONS } from "./callout-data";

const CALLOUT_RE = /^>\s*\[!([a-zA-Z]+)\]([+-]?)(?:\s+(.*))?$/;

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
  ".cm-line.cm-live-callout-note": {
    borderLeft: "3px solid var(--sat-callout-note-border, #8b5cf6)",
    backgroundColor: "var(--sat-callout-note-bg, rgba(139,92,246,0.08))",
  },
  ".cm-line.cm-live-callout-abstract": {
    borderLeft: "3px solid var(--sat-callout-abstract-border, #06b6d4)",
    backgroundColor: "var(--sat-callout-abstract-bg, rgba(6,182,212,0.12))",
  },
  ".cm-line.cm-live-callout-info": {
    borderLeft: "3px solid var(--sat-callout-info-border, #3b82f6)",
    backgroundColor: "var(--sat-callout-info-bg, rgba(59,130,246,0.12))",
  },
  ".cm-line.cm-live-callout-todo": {
    borderLeft: "3px solid var(--sat-callout-todo-border, #3b82f6)",
    backgroundColor: "var(--sat-callout-todo-bg, rgba(59,130,246,0.12))",
  },
  ".cm-line.cm-live-callout-tip": {
    borderLeft: "3px solid var(--sat-callout-tip-border, #0ea5e9)",
    backgroundColor: "var(--sat-callout-tip-bg, rgba(14,165,233,0.12))",
  },
  ".cm-line.cm-live-callout-success": {
    borderLeft: "3px solid var(--sat-callout-success-border, #22c55e)",
    backgroundColor: "var(--sat-callout-success-bg, rgba(34,197,94,0.12))",
  },
  ".cm-line.cm-live-callout-question": {
    borderLeft: "3px solid var(--sat-callout-question-border, #eab308)",
    backgroundColor: "var(--sat-callout-question-bg, rgba(234,179,8,0.12))",
  },
  ".cm-line.cm-live-callout-warning": {
    borderLeft: "3px solid var(--sat-callout-warning-border, #f97316)",
    backgroundColor: "var(--sat-callout-warning-bg, rgba(249,115,22,0.12))",
  },
  ".cm-line.cm-live-callout-failure": {
    borderLeft: "3px solid var(--sat-callout-failure-border, #ef4444)",
    backgroundColor: "var(--sat-callout-failure-bg, rgba(239,68,68,0.12))",
  },
  ".cm-line.cm-live-callout-danger": {
    borderLeft: "3px solid var(--sat-callout-danger-border, #ef4444)",
    backgroundColor: "var(--sat-callout-danger-bg, rgba(239,68,68,0.12))",
  },
  ".cm-line.cm-live-callout-bug": {
    borderLeft: "3px solid var(--sat-callout-bug-border, #ef4444)",
    backgroundColor: "var(--sat-callout-bug-bg, rgba(239,68,68,0.12))",
  },
  ".cm-line.cm-live-callout-example": {
    borderLeft: "3px solid var(--sat-callout-example-border, #a855f7)",
    backgroundColor: "var(--sat-callout-example-bg, rgba(168,85,247,0.12))",
  },
  ".cm-line.cm-live-callout-quote": {
    borderLeft: "3px solid var(--sat-callout-quote-border, #94a3b8)",
    backgroundColor: "var(--sat-callout-quote-bg, rgba(148,163,184,0.12))",
  },
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

  toDOM(view: EditorView) {
    const canonical = CALLOUT_ALIASES[this.type.toLowerCase()] ?? "note";
    const icon = CALLOUT_ICONS[canonical] ?? CALLOUT_ICONS.note;
    const colors = CALLOUT_COLORS[canonical] ?? CALLOUT_COLORS.note;

    const header = document.createElement("div");
    header.className = "cm-callout-header";
    header.style.backgroundColor = colors.bg;
    header.style.borderLeft = `3px solid ${colors.border}`;

    const iconWrapper = document.createElement("span");
    iconWrapper.style.color = colors.icon;
    iconWrapper.style.display = "flex";
    iconWrapper.innerHTML = icon;
    header.appendChild(iconWrapper);

    const titleSpan = document.createElement("span");
    titleSpan.style.color = colors.border;
    titleSpan.textContent =
      this.title || canonical.charAt(0).toUpperCase() + canonical.slice(1);
    header.appendChild(titleSpan);

    if (this.fold !== "") {
      const foldBtn = document.createElement("span");
      foldBtn.className = "cm-callout-fold";
      foldBtn.textContent = this.fold === "+" ? "▾" : "▸";
      foldBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const pos = view.posAtDOM(header);
          const line = view.state.doc.lineAt(pos);
          const match = CALLOUT_RE.exec(line.text);
          if (match) {
            const newFold = this.fold === "+" ? "-" : "+";
            const newHeader = line.text.replace(
              CALLOUT_RE,
              (_m: string, t: string, _f: string, title?: string) => {
                return `> [!${t}]${newFold}${title ? ` ${title}` : ""}`;
              },
            );
            view.dispatch({
              changes: { from: line.from, to: line.to, insert: newHeader },
            });
          }
        } catch {
          // View position lookup fallback
        }
      });
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
  if (node.type.name !== "Blockquote") return false;

  const doc = ctx.state.doc;
  const firstLine = doc.lineAt(node.from);
  const match = CALLOUT_RE.exec(firstLine.text);
  if (!match) return false;

  const rawType = match[1];
  const fold = match[2] ?? "";
  const title = match[3] ?? "";
  const canonical = CALLOUT_ALIASES[rawType.toLowerCase()] ?? "note";

  const hasCursor =
    ctx.headPos >= firstLine.from && ctx.headPos <= firstLine.to;
  const endLine = doc.lineAt(node.to);

  let line = firstLine;
  while (line.number <= endLine.number) {
    if (hasCursor || line.number !== firstLine.number) {
      collector.addLineClass(line.from, "cm-live-callout");
      collector.addLineClass(line.from, `cm-live-callout-${canonical}`);
    }
    if (line.number >= endLine.number || line.to >= doc.length) break;
    line = doc.lineAt(line.to + 1);
  }

  if (!hasCursor) {
    collector.addReplace(
      firstLine.from,
      firstLine.to,
      new CalloutHeaderWidget(rawType, title, fold),
    );
  }

  return true;
}
