/**
 * TaskBadge — inline priority/status pill for task surfaces.
 * Presentational: props in, DOM out. Uses --sat-* theme tokens only.
 */
import type { TaskPriorityName, TaskStatusName } from "../types";
import { PRIORITY_LABEL, STATUS_LABEL } from "../types";

const PRIORITY_CLASS: Record<TaskPriorityName, string> = {
  highest: "text-[var(--sat-state-error)] border-[var(--sat-state-error)]",
  high: "text-[var(--sat-state-warning)] border-[var(--sat-state-warning)]",
  medium: "text-[var(--sat-accent-primary)] border-[var(--sat-accent-primary)]",
  low: "text-[var(--sat-accent-secondary)] border-[var(--sat-accent-secondary)]",
  none: "text-[var(--sat-text-tertiary)] border-[var(--sat-layout-border)]",
  lowest: "text-[var(--sat-text-tertiary)] border-[var(--sat-layout-border)]",
};

const STATUS_CLASS: Record<TaskStatusName, string> = {
  todo: "text-[var(--sat-text-secondary)] border-[var(--sat-layout-border)]",
  in_progress:
    "text-[var(--sat-accent-secondary)] border-[var(--sat-accent-secondary)]",
  on_hold: "text-[var(--sat-state-warning)] border-[var(--sat-state-warning)]",
  done: "text-[var(--sat-state-success)] border-[var(--sat-state-success)]",
  cancelled: "text-[var(--sat-text-tertiary)] border-[var(--sat-layout-border)]",
  non_task: "text-[var(--sat-text-tertiary)] border-[var(--sat-layout-border)]",
};

export interface TaskBadgeProps {
  priority?: TaskPriorityName;
  status?: TaskStatusName;
  label?: string;
  className?: string;
}

export function TaskBadge({ priority, status, label, className }: TaskBadgeProps) {
  if (!priority && !status) return null;

  const text = label ?? (priority ? PRIORITY_LABEL[priority] : STATUS_LABEL[status!]);
  const cls = priority
    ? PRIORITY_CLASS[priority]
    : STATUS_CLASS[status!];

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${cls} ${className ?? ""}`}
    >
      {text}
    </span>
  );
}