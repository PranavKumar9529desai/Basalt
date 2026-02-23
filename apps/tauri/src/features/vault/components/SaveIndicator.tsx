import type { SaveStatus } from "../types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG: Record<SaveStatus, { dot: string; label: string }> = {
  saved: { dot: "bg-[var(--sat-state-success)]", label: "Saved" },
  saving: {
    dot: "bg-[var(--sat-state-warning)] animate-pulse",
    label: "Saving…",
  },
  unsaved: { dot: "bg-[var(--sat-text-muted)]", label: "Unsaved" },
  conflict: {
    dot: "bg-[var(--sat-state-danger)] animate-pulse",
    label: "Conflict",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SaveIndicatorProps {
  status: SaveStatus;
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  const { dot, label } = CONFIG[status];

  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--sat-text-muted)] select-none">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
