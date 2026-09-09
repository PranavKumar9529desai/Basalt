import { cn } from "@workspace/ui/lib/utils";

export interface IndexingToastProps {
  total: number;
  indexed: number;
  percentage: number;
  isComplete: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Obsidian-parity non-blocking toast indicating background vault indexing progress.
 *
 * Styled strictly with `--sat-*` theme tokens and dumb/presentational architecture.
 */
export function IndexingToast({
  total,
  indexed,
  percentage,
  isComplete,
  onDismiss,
  className,
}: IndexingToastProps) {
  const displayPercentage = isComplete ? 100 : Math.min(100, Math.max(0, percentage));

  return (
    <output
      aria-live="polite"
      className={cn(
        "fixed top-4 right-4 z-50 pointer-events-auto block",
        "w-80 rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-3.5 shadow-xl select-none",
        "transition-opacity duration-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[var(--sat-text-primary)]">
            {isComplete ? "Indexing complete" : "Indexing vault…"}
          </span>
          <span className="mt-0.5 text-[11px] text-[var(--sat-text-muted)] leading-tight">
            {isComplete
              ? "All notes and tags are fully indexed."
              : "Some functionality may not be available until this is complete."}
          </span>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] transition-colors p-0.5 rounded outline-none"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--sat-surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--sat-accent-primary)] transition-all duration-150 ease-out"
          style={{ width: `${displayPercentage}%` }}
        />
      </div>

      {/* Progress count & percentage */}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--sat-text-muted)] font-mono">
        <span>
          {indexed.toLocaleString()} / {total.toLocaleString()} notes
        </span>
        <span>{Math.round(displayPercentage)}%</span>
      </div>
    </output>
  );
}
