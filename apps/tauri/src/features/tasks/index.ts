import "./lib/commands";

export { registerTaskCommands, setTaskContext } from "./lib/commands";
export { CreateTaskModal } from "./components/CreateTaskModal";
export { useTaskModalStore } from "./store";
export type { TaskEditTarget } from "./store";

/**
 * Task feature barrel — the ONLY import surface for other layers.
 */
export { useTaskActions } from "./hooks/useTaskActions";
export type { TaskLineResult } from "./hooks/useTaskActions";
