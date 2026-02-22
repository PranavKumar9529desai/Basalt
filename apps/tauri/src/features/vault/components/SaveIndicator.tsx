import type { SaveStatus } from "../types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG: Record<SaveStatus, { dot: string; label: string }> = {
  saved:    { dot: "bg-emerald-500",            label: "Saved"    },
  saving:   { dot: "bg-yellow-400 animate-pulse", label: "Saving…"  },
  unsaved:  { dot: "bg-slate-400",              label: "Unsaved"  },
  conflict: { dot: "bg-red-500 animate-pulse",  label: "Conflict" },
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
    <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
