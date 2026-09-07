// ---------------------------------------------------------------------------
// HTML rendering helpers
// ---------------------------------------------------------------------------

import { escapeHtml } from "./utils";
import type { TypedValue, QueryResult } from "./dql-types";

function renderCellHtml(value: TypedValue): string {
  switch (value.type) {
    case "text":
      return escapeHtml(value.value);
    case "number":
      return String(value.value);
    case "date":
      return `<span class="cm-dql-date">${escapeHtml(value.value)}</span>`;
    case "checkbox":
      return value.value
        ? '<span class="cm-dql-check cm-dql-check--on">✓</span>'
        : '<span class="cm-dql-check cm-dql-check--off">✗</span>';
    case "link":
      return `<a class="internal-link cm-dql-link" data-href="${escapeHtml(value.path)}" data-name="${escapeHtml(value.name)}">${escapeHtml(value.name)}</a>`;
    case "null":
      return '<span class="cm-dql-null">—</span>';
  }
}

function renderTableHtml(result: QueryResult): string {
  if (result.columns.length === 0 || result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const headerHtml = result.columns
    .map((col) => `<th class="cm-dql-th">${escapeHtml(col.name)}</th>`)
    .join("");
  const rowsHtml = result.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td class="cm-dql-td">${renderCellHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<table class="cm-dql-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>${footer}`;
}

function renderListHtml(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const itemsHtml = result.rows
    .map((row) => {
      const cell = row[0];
      return cell
        ? `<li class="cm-dql-list-item">${renderCellHtml(cell)}</li>`
        : "";
    })
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<ul class="cm-dql-list">${itemsHtml}</ul>${footer}`;
}

function renderTaskHtml(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '<div class="cm-dql-empty">No results</div>';
  }
  const itemsHtml = result.rows
    .map((row) => {
      const linkCell = row[0];
      const taskCell = row[1];
      const linkHtml = linkCell ? renderCellHtml(linkCell) : "";
      const taskText = taskCell?.type === "text" ? taskCell.value : "";
      return `<li class="cm-dql-task-item"><span class="cm-dql-task-link">${linkHtml}</span> <span class="cm-dql-task-text">${escapeHtml(taskText)}</span></li>`;
    })
    .join("");
  const footer =
    result.total > result.rows.length
      ? `<div class="cm-dql-footer">Showing ${result.rows.length} of ${result.total}</div>`
      : "";
  return `<ul class="cm-dql-task-list">${itemsHtml}</ul>${footer}`;
}

// ---------------------------------------------------------------------------
// Result rendering — infers query type from column structure
// ---------------------------------------------------------------------------

export function renderDqlResult(result: QueryResult): string {
  // LIST: 1 column "File" with type "link"
  const isList =
    result.columns.length === 1 &&
    result.columns[0].type === "link" &&
    result.columns[0].name === "File";
  // TASK: 2 columns "File" + "Task"
  const isTask =
    result.columns.length === 2 &&
    result.columns[0].type === "link" &&
    result.columns[1].name === "Task";

  if (isList) return renderListHtml(result);
  if (isTask) return renderTaskHtml(result);
  return renderTableHtml(result);
}
