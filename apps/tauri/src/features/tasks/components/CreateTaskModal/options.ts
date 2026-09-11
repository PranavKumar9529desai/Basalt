//! Task form options: select menu data (priority / status / recurrence
//! presets) and the checkbox-marker → status-name mapping shared by the
//! create/edit paths.

export interface SelectOption {
  value: string;
  label: string;
}

/** Checkbox char → status name — single source in `@workspace/editor`. */
export { statusFromCheckboxChar as statusFromChar } from "@workspace/editor";

export const PRIORITIES: readonly SelectOption[] = [
  { value: "", label: "None" },
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
];

export const STATUSES: readonly SelectOption[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export const RECURRENCE_PRESETS: readonly SelectOption[] = [
  { value: "", label: "No recurrence" },
  { value: "every day", label: "Every day" },
  { value: "every week", label: "Every week" },
  { value: "every 2 weeks", label: "Every 2 weeks" },
  { value: "every month", label: "Every month" },
  { value: "every year", label: "Every year" },
];