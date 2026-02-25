import type { FC } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const vaultNameFromPath = (p: string) =>
  p.split("/").filter(Boolean).pop() ?? p;


interface ToolbarProps {
  vaultPath: string;
  isIndexing: boolean;
  status: string | null;
  onChangeVault: () => void;
  onReindex: () => void;
}


export const Toolbar: FC<ToolbarProps> = ({
  vaultPath,
  isIndexing,
  status,
  onChangeVault,
  onReindex,
}) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--sat-layout-border)] shrink-0">
      {/* Vault badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)] min-w-0">
        {/* Folder icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-[var(--sat-text-muted)]"
        >
          <path
            d="M1.5 3.5A1 1 0 0 1 2.5 2.5H6l1.5 2H13.5A1 1 0 0 1 14.5 5.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V3.5Z"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
        </svg>
        <span className="text-xs text-[var(--sat-text-muted)] shrink-0">
          Vault
        </span>
        <span
          className="text-xs font-semibold text-[var(--sat-text-primary)] truncate max-w-[160px]"
          title={vaultPath}
        >
          {vaultNameFromPath(vaultPath)}
        </span>
      </div>

      {/* Change vault */}
      <button
        type="button"
        onClick={onChangeVault}
        disabled={isIndexing}
        className="
          px-2.5 py-1 rounded-md text-xs font-medium
          bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)]
          text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors shrink-0
        "
      >
        Change
      </button>

      {/* Re-index */}
      <button
        type="button"
        onClick={onReindex}
        disabled={isIndexing}
        className="
          inline-flex items-center gap-1.5
          px-2.5 py-1 rounded-md text-xs font-medium
          bg-[var(--sat-surface-2)] border border-[var(--sat-layout-border)]
          text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors shrink-0
        "
      >
        {isIndexing ? (
          <>
            <span className="w-3 h-3 border border-[var(--sat-text-muted)] border-t-[var(--sat-accent-primary)] rounded-full animate-spin" />
            Indexing…
          </>
        ) : (
          <>
            {/* Refresh icon */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.89 1.61"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 1v3.5H8.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Re-index
          </>
        )}
      </button>

      {/* Status message — pushes to the right */}
      {status && (
        <span
          className="ml-auto text-xs text-[var(--sat-text-muted)] truncate max-w-xs"
          title={status}
        >
          {status}
        </span>
      )}
    </div>
  );
};
