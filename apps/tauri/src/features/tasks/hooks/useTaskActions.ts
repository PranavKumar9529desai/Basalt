/**
 * useTaskActions — read-only task IPC wraps (ADR-048).
 * Mutations do NOT go through IPC: create/edit compose text and dispatch
 * into the editor doc (the editor is the single file writer — autosave
 * persists). Only hydration (`get_task_line`) hits Rust.
 */
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

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
  /** Read a single task line's parsed components (for the edit modal). */
  const getTaskLine = useCallback(async (path: string, lineNumber: number) => {
    return invoke<TaskLineResult>("get_task_line", {
      path,
      lineNumber,
    });
  }, []);

  return { getTaskLine };
}
