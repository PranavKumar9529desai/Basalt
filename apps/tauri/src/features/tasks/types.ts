/**
 * Task domain types — mirrors crates/basalt-types/src/task.rs.
 * Used by feature-layer components and hooks.
 */

export type TaskStatusName =
  | "todo"
  | "in_progress"
  | "on_hold"
  | "done"
  | "cancelled"
  | "non_task";

export type TaskPriorityName =
  | "highest"
  | "high"
  | "medium"
  | "none"
  | "low"
  | "lowest";

export interface TaskMeta {
  line: number;
  description: string;
  status: TaskStatusName;
  priority: TaskPriorityName;
  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  doneDate?: string;
  cancelled?: string;
  recurrence?: string;
  tags: string[];
  id?: string;
  dependsOn: string[];
}

/** Priority emoji → name mapping. */
export const PRIORITY_EMOJI: Record<string, TaskPriorityName> = {
  "\u{1F53A}": "highest", // 🔺
  "\u{23EB}\u{FE0F}": "high", // ⏫
  "\u{23EB}": "high", // ⏫ (no variation selector)
  "\u{1F53C}": "medium", // 🔼
  "\u{1F53D}": "low", // 🔽
  "\u{23EC}\u{FE0F}": "lowest", // ⏬
  "\u{23EC}": "lowest", // ⏬ (no variation selector)
};

/** Status character → name mapping. */
export const STATUS_CHAR_MAP: Record<string, TaskStatusName> = {
  " ": "todo",
  "/": "in_progress",
  "?": "on_hold",
  x: "done",
  X: "done",
  "-": "cancelled",
};

/** Priority display label. */
export const PRIORITY_LABEL: Record<TaskPriorityName, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  none: "None",
  low: "Low",
  lowest: "Lowest",
};

/** Status display label. */
export const STATUS_LABEL: Record<TaskStatusName, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  on_hold: "On Hold",
  done: "Done",
  cancelled: "Cancelled",
  non_task: "Non Task",
};