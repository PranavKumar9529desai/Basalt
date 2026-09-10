/**
 * useTaskActions — thin invoke wrappers for task IPC (ADR-048).
 * Owns no state: the source document in CodeMirror is the source of truth.
 */
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { QueryResult } from "@workspace/editor";

/** Wire shape of `create_task` (mirrors Rust CreateTaskInput). */
export interface CreateTaskInput {
  path: string;
  description: string;
  priority?: string;
  due?: string;
  scheduled?: string;
  start?: string;
  recurrence?: string;
  tags?: string[];
}

export interface UpdateTaskInput {
  path: string;
  line_number: number;
  description?: string;
  status?: string;
  priority?: string;
  due?: string;
  scheduled?: string;
  start?: string;
  recurrence?: string;
  tags?: string[];
}

/** Wire shape of `get_task_line` result. */
export interface TaskLineResult {
  raw: string;
  status_char: string;
  description: string;
  signifiers: {
    priority?: string;
    due?: string;
    scheduled?: string;
    start?: string;
    created?: string;
    recurrence?: string;
    tags: string[];
  };
}

export function useTaskActions() {
  /** Toggle a task's status at a line; returns the new status string. */
  const toggleTask = useCallback(
    async (path: string, lineNumber: number) => {
      return invoke<string>("toggle_task", { path, lineNumber });
    },
    [],
  );

  /** Create a new task by appending a checkbox line; returns the line number. */
  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      return invoke<number>("create_task", { input });
    },
    [],
  );

  /** Update an existing task's signifiers on a line. */
  const updateTask = useCallback(async (input: UpdateTaskInput) => {
    await invoke("update_task", { input });
  }, []);

  /** Read a single task line's parsed components (for the edit modal). */
  const getTaskLine = useCallback(
    async (path: string, lineNumber: number) => {
      return invoke<TaskLineResult>("get_task_line", {
        path,
        lineNumber,
      });
    },
    [],
  );

  /** Query tasks across the vault (used by board + query widget). */
  const getTasks = useCallback(
    async (query?: { filters: unknown[]; sorts: unknown[]; groups: string[]; limit: number | null }) => {
      return invoke<QueryResult>("get_tasks", { query });
    },
    [],
  );

  return { toggleTask, createTask, updateTask, getTaskLine, getTasks };
}