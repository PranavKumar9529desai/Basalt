import type { FC } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VaultSplashProps {
  isIndexing: boolean;
  status: string | null;
  onOpenVault: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VaultSplash: FC<VaultSplashProps> = ({
  isIndexing,
  status,
  onOpenVault,
}) => {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8">
      {/* Logo / wordmark */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-2xl bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] flex items-center justify-center">
          {/* Simple geometric mark — replace with real SVG logo later */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <polygon
              points="16,3 29,24 3,24"
              stroke="var(--sat-text-muted)"
              strokeWidth="2"
              fill="none"
            />
            <polygon
              points="16,10 24,24 8,24"
              stroke="var(--sat-text-muted)"
              strokeWidth="1.5"
              fill="var(--sat-surface-3)"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--sat-text-primary)]">
          Basalt
        </h1>
        <p className="text-sm text-[var(--sat-text-muted)] text-center max-w-xs leading-relaxed">
          A fast, local-first markdown notebook.
          <br />
          Open a folder to get started.
        </p>
      </div>

      {/* Action */}
      <button
        type="button"
        onClick={onOpenVault}
        disabled={isIndexing}
        className="
          inline-flex items-center gap-2
          px-6 py-3 rounded-lg
          bg-[var(--sat-accent-primary)] hover:bg-[var(--sat-accent-strong)] active:bg-[var(--sat-accent-strong)]
          text-[var(--sat-text-inverse)] font-semibold text-sm
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors shadow-sm
        "
      >
        {isIndexing ? (
          <>
            {/* Spinner */}
            <span className="w-4 h-4 border-2 border-[var(--sat-text-inverse)]/40 border-t-[var(--sat-text-inverse)] rounded-full animate-spin" />
            Indexing…
          </>
        ) : (
          <>
            {/* Folder icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1.5 3.5A1 1 0 0 1 2.5 2.5H6l1.5 2H13.5A1 1 0 0 1 14.5 5.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V3.5Z"
                stroke="currentColor"
                strokeWidth="1.25"
                fill="none"
              />
            </svg>
            Open Vault Folder
          </>
        )}
      </button>

      {/* Status / error */}
      {status && (
        <p className="text-xs text-[var(--sat-state-danger)] max-w-sm text-center">
          {status}
        </p>
      )}
    </div>
  );
};
