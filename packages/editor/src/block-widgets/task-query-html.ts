import { escapeHtml } from "./utils";
import type { QueryResult, TypedValue } from "./dql-types";
import type { ParsedTaskQuery } from "./task-query-types";

// Column indices — must match crates/basalt-tables/src/output.rs task_columns().
const COL = {
  file: 0,
  description: 1,
  status: 2,
  priority: 3,
  due: 4,
  scheduled: 5,
  tags: 6,
  urgency: 7,
  path: 8,
  line: 9,
} as const;

/**
 * Render a task QueryResult (10-column TaskQuery shape) as grouped checkbox
 * lists with priority badges and date chips. The engine returns a flat sorted
 * list, so grouping by `parsed.query.groups[0]` happens client-side here.
 */
export function renderTaskQueryResult(
  result: QueryResult,
  parsed: ParsedTaskQuery,
): string {
  if (result.rows.length === 0) {
    return '<div class="cm-task-empty">No tasks found</div>';
  }
  const groupField = parsed.query.groups[0];

  let body: string;
  if (groupField) {
    const buckets = new Map<string, TypedValue[][]>();
    for (const row of result.rows) {
      const key = groupKey(row, groupField);
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }
    body = [...buckets.entries()]
      .map(
        ([key, rows]) =>
          `<section class="cm-task-group"><h4 class="cm-task-group-title">${escapeHtml(key)} <span class="cm-task-group-count">${rows.length}</span></h4><ul class="cm-task-list">${rows.map((r) => renderRow(r, parsed)).join("")}</ul></section>`,
      )
      .join("");
  } else {
    body = `<ul class="cm-task-list">${result.rows.map((r) => renderRow(r, parsed)).join("")}</ul>`;
  }

  let footer = "";
  if (!parsed.display.hideTaskCount) {
    const shown =
      result.total > result.rows.length
        ? `${result.rows.length} of ${result.total} tasks`
        : `${result.total} task${result.total === 1 ? "" : "s"}`;
    footer = `<div class="cm-task-footer">${shown}</div>`;
  }
  if (parsed.unsupported.length > 0) {
    footer += `<div class="cm-task-unsupported">Unsupported: ${parsed.unsupported.map(escapeHtml).join(" · ")}</div>`;
  }
  return `${body}${footer}`;
}

function renderRow(row: TypedValue[], parsed: ParsedTaskQuery): string {
  const { display } = parsed;
  const desc = escapeHtml(cellText(row[COL.description]));
  const status = cellText(row[COL.status]);
  const link = row[COL.file];

  const chips: string[] = [];
  if (!display.hidePriority) {
    const prioClass = priorityClass(cellText(row[COL.priority]));
    if (prioClass) {
      chips.push(
        `<span class="cm-task-chip ${prioClass}">${priorityLabel(cellText(row[COL.priority]))}</span>`,
      );
    }
  }
  if (!display.hideDue) {
    const due = row[COL.due];
    if (due && due.type === "date") {
      chips.push(
        `<span class="cm-task-chip cm-task-date--due">📅 ${escapeHtml(due.value)}</span>`,
      );
    }
  }
  if (!display.hideScheduled) {
    const scheduled = row[COL.scheduled];
    if (scheduled && scheduled.type === "date") {
      chips.push(
        `<span class="cm-task-chip cm-task-date--scheduled">🛫 ${escapeHtml(scheduled.value)}</span>`,
      );
    }
  }
  if (!display.hideTags) {
    const tagsCell = row[COL.tags];
    if (tagsCell && tagsCell.type === "list") {
      for (const item of tagsCell.items) {
        if (item.type === "text") {
          chips.push(
            `<span class="cm-task-chip cm-task-tag">#${escapeHtml(item.value)}</span>`,
          );
        }
      }
    }
  }
  if (display.showUrgency) {
    const urgency = row[COL.urgency];
    if (urgency && urgency.type === "number") {
      chips.push(
        `<span class="cm-task-chip cm-task-urgency">urgency ${urgency.value}</span>`,
      );
    }
  }
  const chipsHtml = chips.length
    ? `<span class="cm-task-chips">${chips.join("")}</span>`
    : "";

  const linkHtml =
    link?.type === "link"
      ? `<a class="cm-task-backlink internal-link" href="#" data-name="${escapeHtml(link.name)}" data-path="${escapeHtml(link.path)}">${escapeHtml(link.name)}</a>`
      : "";

  return `<li class="cm-task-item">
    <span class="cm-task-checkbox" data-status="${escapeHtml(status)}"></span>
    <span class="cm-task-body">
      <span class="cm-task-desc">${desc || "<em>Untitled task</em>"}</span>
      ${chipsHtml}
    </span>
    ${linkHtml ? `<span class="cm-task-file">${linkHtml}</span>` : ""}
  </li>`;
}

function groupKey(row: TypedValue[], field: string): string {
  switch (field) {
    case "status":
      return cellText(row[COL.status]) || "no status";
    case "priority":
      return cellText(row[COL.priority]) || "none";
    case "due": {
      const cell = row[COL.due];
      return cell && cell.type === "date" ? cell.value : "no due date";
    }
    case "scheduled": {
      const cell = row[COL.scheduled];
      return cell && cell.type === "date" ? cell.value : "no scheduled date";
    }
    default:
      return "";
  }
}

function cellText(v: TypedValue | undefined): string {
  if (!v) return "";
  switch (v.type) {
    case "text":
      return v.value;
    case "number":
      return String(v.value);
    default:
      return "";
  }
}

function priorityClass(priority: string): string {
  switch (priority) {
    case "highest":
      return "cm-task-priority--highest";
    case "high":
      return "cm-task-priority--high";
    case "medium":
      return "cm-task-priority--medium";
    case "low":
      return "cm-task-priority--low";
    case "lowest":
      return "cm-task-priority--lowest";
    default:
      return "";
  }
}

function priorityLabel(priority: string): string {
  const symbols: Record<string, string> = {
    highest: "🔺",
    high: "⏫",
    medium: "🔼",
    low: "🔽",
    lowest: "⏬",
  };
  return symbols[priority] ?? "";
}
