import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

import {
  cycleStatus,
  parseTaskSignifiers,
  statusToCheckboxChar,
  type TaskSignifiers,
} from "./task-signifiers";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Priority badge colors via --sat-* tokens. */
const PRIORITY_COLORS: Record<string, string> = {
  highest: "var(--sat-state-error, #ef4444)",
  high: "var(--sat-state-warning, #f97316)",
  medium: "var(--sat-accent-primary, #eab308)",
  low: "var(--sat-accent-secondary, #3b82f6)",
  lowest: "var(--sat-text-tertiary, #6b7280)",
};

/** Priority label short forms for the badge. */
const PRIORITY_BADGE_LABEL: Record<string, string> = {
  highest: "\u{1F53A}", // 🔺
  high: "\u{2B06}\u{FE0F}", // ⏫
  medium: "\u{1F53B}", // 🔼
  low: "\u{1F53D}", // 🔽
  lowest: "\u{23EC}", // ⏬
};

export const TASK_CHECKBOX_THEME = EditorView.baseTheme({
  ".cm-task-marker": {
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "middle",
  },
  ".cm-task-checkbox": {
    accentColor: "var(--sat-accent-primary, #3b82f6)",
    cursor: "pointer",
    marginRight: "4px",
  },
  ".cm-task-done": {
    textDecoration: "line-through",
    opacity: "0.5",
  },
  ".cm-task-priority-badge": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    lineHeight: "16px",
    borderRadius: "4px",
    padding: "0 4px",
    marginLeft: "4px",
    marginRight: "4px",
    fontWeight: "500",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  ".cm-task-date-chip": {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "11px",
    lineHeight: "16px",
    borderRadius: "4px",
    padding: "0 4px",
    marginLeft: "2px",
    marginRight: "2px",
    backgroundColor: "var(--sat-surface-2, #1e293b)",
    color: "var(--sat-text-secondary, #94a3b8)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  ".cm-task-date-chip-overdue": {
    color: "var(--sat-state-error, #ef4444)",
  },
  ".cm-task-tag-chip": {
    display: "inline-flex",
    alignItems: "center",
    fontSize: "11px",
    lineHeight: "16px",
    borderRadius: "4px",
    padding: "0 4px",
    marginLeft: "2px",
    marginRight: "2px",
    backgroundColor: "var(--sat-surface-2, #1e293b)",
    color: "var(--sat-accent-secondary, #3b82f6)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
});


// ---------------------------------------------------------------------------
// Format date for display: "Jan 7" or "Jan 7, 2024"
// ---------------------------------------------------------------------------

function formatDateChip(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const thisYear = new Date().getFullYear();
  return year === thisYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
}

/** Check if a date string is in the past. */
function isOverdue(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly checked: boolean,
    private readonly signifiers: TaskSignifiers | null,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return (
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to &&
      other.signifiers?.status === this.signifiers?.status &&
      other.signifiers?.priority === this.signifiers?.priority
    );
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-task-marker";

    // Checkbox input
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;

    input.addEventListener("click", (event) => {
      event.preventDefault();
      const currentStatus = this.signifiers?.status ?? (this.checked ? "done" : "todo");
      const nextStatus = cycleStatus(currentStatus);
      const newChar = statusToCheckboxChar(nextStatus);
      const replacement = `[${newChar}]`;
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: replacement },
      });
      view.focus();
    });

    wrapper.appendChild(input);

    // Priority badge
    if (this.signifiers && this.signifiers.priority !== "none") {
      const badge = document.createElement("span");
      badge.className = "cm-task-priority-badge";
      badge.textContent =
        PRIORITY_BADGE_LABEL[this.signifiers.priority] ??
        this.signifiers.priority;
      const color = PRIORITY_COLORS[this.signifiers.priority];
      if (color) {
        badge.style.backgroundColor = color;
        badge.style.color = "#fff";
      }
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inline decorations (date chips + tag chips after the task text)
// ---------------------------------------------------------------------------

function buildInlineDecorations(
  view: EditorView,
  signifiers: TaskSignifiers,
  from: number,
  builder: RangeSetBuilder<Decoration>,
) {
  const line = view.state.doc.lineAt(from);
  const lineEnd = line.to;

  // We place inline decorations at the END of the line (after the text)
  // so they don't interfere with the editable content.
  // Format: [date chips] [tag chips]

  const chips: Array<{ text: string; className: string }> = [];

  // Date chips — due, scheduled, start in that order
  for (const [field, label] of [
    ["due", "\u{1F4C5}"],
    ["scheduled", "\u{23F3}"],
    ["start", "\u{1F6EB}"],
  ] as const) {
    const val = signifiers[field as keyof TaskSignifiers];
    if (typeof val === "string" && val) {
      const text = `${label} ${formatDateChip(val)}`;
      const cls =
        field === "due" && isOverdue(val)
          ? "cm-task-date-chip cm-task-date-chip-overdue"
          : "cm-task-date-chip";
      chips.push({ text, className: cls });
    }
  }

  // Tag chips
  for (const tag of signifiers.tags) {
    chips.push({ text: tag, className: "cm-task-tag-chip" });
  }

  if (chips.length === 0) return;

  // Add a space separator + chips as a single decoration at line end
  const spacerText = " ";
  const chipHtml = chips
    .map(
      (c) =>
        `<span class="${c.className}">${escapeHtml(c.text)}</span>`,
    )
    .join("");

  builder.add(
    lineEnd,
    lineEnd,
    Decoration.widget({
      widget: new InlineChipWidget(spacerText + chipHtml),
      side: 1,
    }),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Inline chip widget (HTML-based, no DOM creation overhead)
// ---------------------------------------------------------------------------

class InlineChipWidget extends WidgetType {
  constructor(private readonly html: string) {
    super();
  }

  eq(other: InlineChipWidget) {
    return other.html === this.html;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-task-inline-chips";
    span.innerHTML = this.html;
    return span;
  }
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

export function buildTaskDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.type.name !== "TaskMarker") return;
        const marker = view.state.doc.sliceString(node.from, node.to);
        const checked = marker.toLowerCase() === "[x]";

        // Parse signifiers from the full line text
        const lineText = view.state.doc.lineAt(node.from).text;
        const signifiers = parseTaskSignifiers(lineText);

        // Replace checkbox with interactive widget
        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new TaskCheckboxWidget(
              node.from,
              node.to,
              checked,
              signifiers,
            ),
          }),
        );

        // Strikethrough on done tasks
        if (checked) {
          const line = view.state.doc.lineAt(node.from);
          if (node.to < line.to) {
            builder.add(
              node.to,
              line.to,
              Decoration.mark({ class: "cm-task-done" }),
            );
          }
        }

        // Inline chips (dates, tags) at end of line
        if (signifiers) {
          buildInlineDecorations(view, signifiers, node.from, builder);
        }
      },
    });
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// View plugin
// ---------------------------------------------------------------------------

export const taskListPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTaskDecorations(view);
    }

    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildTaskDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);
