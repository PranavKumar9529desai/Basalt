import type { SettingItemSpec } from "../types";

/**
 * Tasks core-plugin specs (ADR-048 §6 / ADR-037 §7).
 */
export const TASKS_SPECS: SettingItemSpec[] = [
  {
    key: "tasksGlobalFilter",
    name: "Global filter",
    description:
      "Filter applied to every task query — e.g. `#work -#home`. Leave empty for no filter.",
    type: "text",
    placeholder: "None",
    keywords: ["tasks", "filter", "query"],
  },
  {
    key: "tasksDefaultPriority",
    name: "Default priority",
    description: "Priority applied to newly created tasks. None omits the signifier.",
    type: "dropdown",
    options: [
      { value: "none", label: "None" },
      { value: "highest", label: "Highest" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "lowest", label: "Lowest" },
    ],
    keywords: ["tasks", "priority", "default"],
  },
  {
    key: "tasksDoneDateAutoAdd",
    name: "Auto-add done date",
    description: "Stamp ⭐ (done date) when a task is marked done.",
    type: "toggle",
    keywords: ["tasks", "done", "date"],
  },
  {
    key: "tasksCancelledDateAutoAdd",
    name: "Auto-add cancelled date",
    description: "Stamp ✖️ (cancelled date) when a task is cancelled.",
    type: "toggle",
    keywords: ["tasks", "cancelled", "date"],
  },
  {
    key: "tasksCreatedDateAutoAdd",
    name: "Auto-add created date",
    description: "Stamp ➕ (created date) on every new task.",
    type: "toggle",
    keywords: ["tasks", "created", "date"],
  },
  {
    key: "tasksStatusSequence",
    name: "Status cycle sequence",
    description:
      "Checkbox sequence for status cycling (click or toggle command): " +
      "In Progress → Done covers todo →[/]→[x]→[ ].",
    type: "dropdown",
    options: [
      { value: "in_progress,done", label: "In Progress → Done" },
      { value: "done", label: "Done only" },
    ],
    keywords: ["tasks", "status", "cycle", "checkbox"],
  },
  {
    key: "tasksNewTaskPosition",
    name: "New task position",
    description: "Where a task from the create command is inserted relative to the cursor.",
    type: "dropdown",
    options: [
      { value: "above", label: "Above the cursor" },
      { value: "below", label: "Below the cursor" },
    ],
    keywords: ["tasks", "new", "position"],
  },
  {
    key: "tasksRemoveScheduledOnRecurrence",
    name: "Remove scheduled date on recurrence",
    description:
      "When a recurring task is completed, clear its scheduled signifier so the next instance isn't stale.",
    type: "toggle",
    keywords: ["tasks", "recurrence", "scheduled"],
  },
];