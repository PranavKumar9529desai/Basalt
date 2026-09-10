import type {
  ParsedTaskQuery,
  TaskDisplayOptions,
  TaskFilter,
  TaskSort,
} from "./task-query-types";
import { DEFAULT_TASK_DISPLAY } from "./task-query-types";

// Parses each line of a ```tasks block into engine filters/sorts/groups/limit
// plus frontend display options (ADR-048 §4.2). Filters are AND-combined.

function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

// Monday of the week containing `date`.
function startOfWeek(date: Date): Date {
  const out = new Date(date);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}

/** Resolve a relative date token ("today", "this week", …) to a day range. */
function resolveDateToken(
  token: string,
  today: Date,
): { start: string; end: string } | null {
  const t = token.toLowerCase().trim();
  if (t === "today") return { start: fmt(today), end: fmt(today) };
  if (t === "tomorrow") {
    const d = shiftDays(today, 1);
    return { start: fmt(d), end: fmt(d) };
  }
  if (t === "yesterday") {
    const d = shiftDays(today, -1);
    return { start: fmt(d), end: fmt(d) };
  }
  if (t === "this week") {
    const start = startOfWeek(today);
    const end = shiftDays(start, 6);
    return { start: fmt(start), end: fmt(end) };
  }
  if (t === "next week") {
    const start = shiftDays(startOfWeek(today), 7);
    const end = shiftDays(start, 6);
    return { start: fmt(start), end: fmt(end) };
  }
  if (t === "last week") {
    const start = shiftDays(startOfWeek(today), -7);
    const end = shiftDays(start, 6);
    return { start: fmt(start), end: fmt(end) };
  }
  return null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` or a relative token; null when unrecognized. */
export function parseDate(
  value: string,
  today: Date,
): { start: string; end: string } | null {
  if (DATE_RE.test(value.trim())) {
    return { start: value.trim(), end: value.trim() };
  }
  return resolveDateToken(value, today);
}

interface ParserState {
  filters: TaskFilter[];
  sorts: TaskSort[];
  groups: string[];
  limit: number | null;
  display: TaskDisplayOptions;
  unsupported: string[];
}

/**
 * Parse a ```tasks block body into an engine query + display options.
 * Unrecognized instructions are collected (not fatal) and surfaced via
 * `unsupported` so the widget can show an explain footer.
 */
export function parseTaskQuery(body: string, now: Date = new Date()): ParsedTaskQuery {
  const state: ParserState = {
    filters: [],
    sorts: [],
    groups: [],
    limit: null,
    display: { ...DEFAULT_TASK_DISPLAY },
    unsupported: [],
  };

  for (const line of splitInstructions(body)) {
    const handled =
      parseStatusFilter(line, state) ||
      parsePriorityFilter(line, state) ||
      parseDateFilter(line, state, now) ||
      parseTextFilter(line, state) ||
      parseRecurrenceFilter(line, state) ||
      parseDependencyFilter(line, state) ||
      parseSortLine(line, state) ||
      parseGroupLine(line, state) ||
      parseLimitLine(line, state) ||
      parseDisplayLine(line, state);
    if (!handled) {
      state.unsupported.push(line);
    }
  }

  return {
    query: {
      filters: state.filters,
      sorts: state.sorts,
      groups: state.groups,
      limit: state.limit,
    },
    display: state.display,
    unsupported: state.unsupported,
  };
}

/** Split raw block body into non-empty instruction lines (skips `#` comments). */
export function splitInstructions(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function parseStatusFilter(rest: string, state: ParserState): boolean {
  if (/^done$/.test(rest)) {
    state.filters.push({ field: "status", op: "equals", value: "done" });
    return true;
  }
  if (/^not\s+done$/.test(rest)) {
    state.filters.push({ field: "status", op: "not_equals", value: "done" });
    return true;
  }
  const is = rest.match(/^status(?:\s+is|\s*\.type\s+is)\s+(\w[\w\s]*)$/i);
  if (is) {
    state.filters.push({
      field: "status",
      op: "equals",
      value: is[1].trim().toLowerCase(),
    });
    return true;
  }
  return false;
}

function parsePriorityFilter(rest: string, state: ParserState): boolean {
  const above = rest.match(/^priority\s+above\s+(\w+)$/);
  if (above) {
    state.filters.push({ field: "priority", op: "above", value: above[1] });
    return true;
  }
  const below = rest.match(/^priority\s+below\s+(\w+)$/);
  if (below) {
    state.filters.push({ field: "priority", op: "below", value: below[1] });
    return true;
  }
  const is = rest.match(/^priority\s+is\s+(\w+)$/);
  if (is) {
    state.filters.push({ field: "priority", op: "equals", value: is[1] });
    return true;
  }
  return false;
}

const DATE_FIELDS = /^(due|scheduled|start|created|happens|done|cancelled)\s+(.+)$/;

function parseDateFilter(rest: string, state: ParserState, today: Date): boolean {
  // "no due date" / "no scheduled date" — field is empty.
  const none = rest.match(/^no\s+(due|scheduled|start|created|happens|done|cancelled)\s+date$/);
  if (none) {
    state.filters.push({ field: none[1], op: "is_empty", value: "" });
    return true;
  }

  const dateField = DATE_FIELDS.exec(rest);
  if (!dateField) return false;
  const field = dateField[1];
  const expr = dateField[2].trim();

  if (/^is\s+empty$/.test(expr)) {
    state.filters.push({ field, op: "is_empty", value: "" });
    return true;
  }
  if (/^exists$/.test(expr)) {
    state.filters.push({ field, op: "exists", value: "" });
    return true;
  }

  // Optional comparison operator; a bare date means "on <date>".
  const opMatch = /^(before|on or before|on or after|after|on)\s+(.+)$/.exec(expr);
  const dateToken = opMatch ? opMatch[2] : expr;
  const dateRange = parseDate(dateToken, today);
  if (!dateRange) {
    state.unsupported.push(`unrecognized date: ${expr}`);
    return true;
  }
  const op = opMatch ? opMatch[1].replace(/\s+/g, "_") : "on";

  // Single-day token: the operator applies directly.
  if (dateRange.start === dateRange.end) {
    if (op === "on") {
      state.filters.push({ field, op: "equals", value: dateRange.start });
      return true;
    }
    state.filters.push({ field, op, value: dateRange.start });
    return true;
  }

  // Ranged token (this week): "before ranges" bound at the start, "after
  // ranges" at the end, bare ranges are inclusive [start, end].
  if (op === "before" || op === "on_or_before") {
    state.filters.push({ field, op: "before", value: dateRange.start });
    return true;
  }
  if (op === "after" || op === "on_or_after") {
    state.filters.push({ field, op: "after", value: dateRange.end });
    return true;
  }
  state.filters.push({ field, op: "on_or_after", value: dateRange.start });
  state.filters.push({ field, op: "on_or_before", value: dateRange.end });
  return true;
}

function parseTextFilter(rest: string, state: ParserState): boolean {
  const desc = rest.match(/^description\s+(includes|equals)\s+(.+)$/i);
  if (desc) {
    state.filters.push({
      field: "description",
      op: desc[1].toLowerCase(),
      value: unquote(desc[2].trim()),
    });
    return true;
  }
  const tag = rest.match(/^tags?\s+includes?\s+(.+)$/i);
  if (tag) {
    state.filters.push({
      field: "tags",
      op: "includes",
      value: unquote(tag[1].trim()).replace(/^#/, ""),
    });
    return true;
  }
  const path = rest.match(/^(path|folder|filename)\s+includes\s+(.+)$/i);
  if (path) {
    state.filters.push({
      field: path[1].toLowerCase(),
      op: "includes",
      value: unquote(path[2].trim()),
    });
    return true;
  }
  return false;
}

function parseRecurrenceFilter(rest: string, state: ParserState): boolean {
  if (/^is\s+recurring$/.test(rest)) {
    state.filters.push({ field: "recurrence", op: "exists", value: "" });
    return true;
  }
  if (/^is\s+not\s+recurring$/.test(rest)) {
    state.filters.push({ field: "recurrence", op: "is_empty", value: "" });
    return true;
  }
  const inc = rest.match(/^recurrence\s+includes\s+(.+)$/i);
  if (inc) {
    state.filters.push({
      field: "recurrence",
      op: "includes",
      value: unquote(inc[1].trim()),
    });
    return true;
  }
  return false;
}

function parseDependencyFilter(rest: string, state: ParserState): boolean {
  if (/^is\s+blocked$/.test(rest)) {
    state.filters.push({ field: "depends_on", op: "exists", value: "" });
    return true;
  }
  if (/^is\s+not\s+blocked$/.test(rest)) {
    state.filters.push({ field: "depends_on", op: "is_empty", value: "" });
    return true;
  }
  return false;
}

const SORT_FIELDS: Record<string, string> = {
  due: "due",
  priority: "priority",
  urgency: "urgency",
  status: "status",
  "status.type": "status",
  description: "description",
  path: "path",
  filename: "path",
  scheduled: "scheduled",
  start: "start",
  created: "created",
  happens: "happens",
  line: "line",
};

function parseSortLine(rest: string, state: ParserState): boolean {
  const m = rest.match(/^sort\s+by\s+([\w.]+)(\s+reverse)?$/);
  if (!m) return false;
  const engineField = SORT_FIELDS[m[1].toLowerCase()];
  if (!engineField) {
    state.unsupported.push(`unsupported sort: ${m[1]}`);
    return true;
  }
  state.sorts.push({ field: engineField, reverse: Boolean(m[2]) });
  return true;
}

const GROUP_FIELDS: Record<string, string> = {
  status: "status",
  "status.name": "status",
  "status.type": "status",
  due: "due",
  scheduled: "scheduled",
  start: "start",
  created: "created",
  priority: "priority",
  urgency: "urgency",
  path: "path",
  filename: "path",
  recurrence: "recurrence",
};

function parseGroupLine(rest: string, state: ParserState): boolean {
  const m = rest.match(/^group\s+by\s+([\w.]+)$/);
  if (!m) return false;
  const engineField = GROUP_FIELDS[m[1].toLowerCase()];
  if (!engineField) {
    state.unsupported.push(`unsupported group: ${m[1]}`);
    return true;
  }
  state.groups.push(engineField);
  return true;
}

function parseLimitLine(rest: string, state: ParserState): boolean {
  const m = rest.match(/^limit\s+(\d+)$/);
  if (!m) return false;
  state.limit = Number(m[1]);
  return true;
}

const DISPLAY_OPTIONS: Record<string, keyof TaskDisplayOptions> = {
  "hide priority": "hidePriority",
  "hide due date": "hideDue",
  "hide scheduled date": "hideScheduled",
  "hide start date": "hideStart",
  "hide created date": "hideCreated",
  "hide recurrence rule": "hideRecurrence",
  "hide tags": "hideTags",
  "hide task count": "hideTaskCount",
  "hide toolbar": "hideToolbar",
  "show urgency": "showUrgency",
};

function parseDisplayLine(rest: string, state: ParserState): boolean {
  const line = rest.trim().toLowerCase();
  if (line === "full mode") {
    state.display.shortMode = false;
    state.display.hideDue = false;
    state.display.hidePriority = false;
    state.display.hideTags = false;
    return true;
  }
  if (line === "short mode") {
    state.display.shortMode = true;
    state.display.hidePriority = true;
    state.display.hideScheduled = true;
    state.display.hideRecurrence = true;
    state.display.hideTags = true;
    return true;
  }
  const key = DISPLAY_OPTIONS[line];
  if (!key) return false;
  state.display[key] = true;
  return true;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}