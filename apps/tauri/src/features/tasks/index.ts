import "./lib/commands";

export { registerTaskCommands, setTaskContext } from "./lib/commands";
export { CreateTaskModal } from "./components/CreateTaskModal";
export { useTaskModalStore } from "./store";
export type { TaskEditTarget } from "./store";

/**
 * Task feature barrel — the ONLY import surface for other layers.
 */
export * from "./types";
export { useTaskActions } from "./hooks/useTaskActions";
export type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskLineResult,
} from "./hooks/useTaskActions";
export { TaskBadge } from "./components/TaskBadge";
export type { TaskBadgeProps } from "./components/TaskBadge";
export { TaskDateChip } from "./components/TaskDateChip";
export type { TaskDateChipProps } from "./components/TaskDateChip";
export { TASK_ICONS } from "./lib/task-icons";