// Mirrors crates/basalt-tables/src/output.rs task query structs exactly —
// this is the wire contract for the `get_tasks` Tauri command (ADR-048).

import type { QueryResult } from "./dql-types";

/** AND-combined filter predicate sent to the engine. */
export interface TaskFilter {
  /** Field: status | priority | due | scheduled | start | created | happens |
   *  description | tags | path | folder | filename | recurrence | depends_on */
  field: string;
  /** Op: equals | not_equals | before | after | on_or_before | on_or_after |
   *  includes | is_empty | exists | above | below */
  op: string;
  /** Value (string form; dates as YYYY-MM-DD). */
  value: string;
}

/** Sort specification sent to the engine. */
export interface TaskSort {
  /** Field: due | priority | urgency | status | description | path |
   *  scheduled | start | created | happens | line */
  field: string;
  reverse: boolean;
}

/** Complete task query — mirrors Rust `TaskQuery` (serde, all fields present). */
export interface TaskQuery {
  filters: TaskFilter[];
  sorts: TaskSort[];
  groups: string[];
  limit: number | null;
}

/** Dependency injected by the feature layer — calls the `get_tasks` IPC. */
export type RunTasksQueryFn = (query: TaskQuery) => Promise<QueryResult>;

/** Display options parsed from ```tasks blocks (frontend-only rendering). */
export interface TaskDisplayOptions {
  shortMode: boolean;
  hidePriority: boolean;
  hideDue: boolean;
  hideScheduled: boolean;
  hideStart: boolean;
  hideCreated: boolean;
  hideRecurrence: boolean;
  hideTags: boolean;
  hideTaskCount: boolean;
  hideToolbar: boolean;
  showUrgency: boolean;
}

export const DEFAULT_TASK_DISPLAY: TaskDisplayOptions = {
  shortMode: false,
  hidePriority: false,
  hideDue: false,
  hideScheduled: false,
  hideStart: false,
  hideCreated: false,
  hideRecurrence: false,
  hideTags: false,
  hideTaskCount: false,
  hideToolbar: false,
  showUrgency: false,
};

/** Full parse output: the engine query plus frontend display options. */
export interface ParsedTaskQuery {
  query: TaskQuery;
  display: TaskDisplayOptions;
  /** Instructions the parser did not understand (surfaced in the footer). */
  unsupported: string[];
}