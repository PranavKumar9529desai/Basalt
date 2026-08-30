import type { FC } from "react";

interface VaultSplashProps {
  isIndexing: boolean;
  status: string | null;
  onOpenVault: () => void;
}

export const VaultSplash: FC<VaultSplashProps> = ({
  isIndexing,
  status,
  onOpenVault,
}) => {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8">
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
