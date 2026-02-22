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
        <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
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
              stroke="#94a3b8"
              strokeWidth="2"
              fill="none"
            />
            <polygon
              points="16,10 24,24 8,24"
              stroke="#475569"
              strokeWidth="1.5"
              fill="#1e293b"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          Basalt
        </h1>
        <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
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
          bg-blue-600 hover:bg-blue-500 active:bg-blue-700
          text-white font-semibold text-sm
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors shadow-sm
        "
      >
        {isIndexing ? (
          <>
            {/* Spinner */}
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <p className="text-xs text-red-400 max-w-sm text-center">{status}</p>
      )}
    </div>
  );
};
