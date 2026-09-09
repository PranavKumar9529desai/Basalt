import type { FC } from "react";
import { useState, useEffect } from "react";
import { BasaltMark, BasaltWordmark } from "@workspace/ui/components/brand";

interface VaultSplashProps {
  isIndexing: boolean;
  status: string | null;
  onOpenVault: () => void;
}

/**
 * Entrance animation sequence (~500ms total):
 * 0ms   → mark fades in
 * 100ms → wordmark slides up + fades in
 * 200ms → tagline fades in
 * 250ms → button slides up + fades in
 */
export const VaultSplash: FC<VaultSplashProps> = ({
  isIndexing,
  status,
  onOpenVault,
}) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Trigger entrance animation on next frame after mount
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center flex-1 gap-10 select-none"
    >
      {/* Brand Hero */}
      <div className="flex flex-col items-center gap-6">
        {/* Mark + ambient glow */}
        <div className="relative">
          {/* Ambient orange glow behind the mark */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -m-8 rounded-full opacity-0 transition-opacity duration-500"
            style={{
              background:
                "radial-gradient(circle, rgba(255,106,0,0.07) 0%, transparent 60%)",
              transitionTimingFunction: ready ? "ease-out" : "ease-in",
              ...(ready ? { opacity: 1 } : {}),
            }}
          />
          <div
            className="opacity-0 transition-opacity duration-300"
            style={{
              transitionTimingFunction: ready ? "ease-out" : "ease-in",
              ...(ready ? { opacity: 1 } : {}),
              transitionDelay: "0ms",
            }}
          >
            <BasaltMark size="4xl" />
          </div>
        </div>

        {/* Wordmark */}
        <div
          className="opacity-0 transition-all duration-300"
          style={{
            transitionTimingFunction: ready ? "ease-out" : "ease-in",
            ...(ready ? { opacity: 1, transform: "translateY(0)" } : { transform: "translateY(4px)" }),
            transitionDelay: "80ms",
          }}
        >
          <BasaltWordmark size="2xl" />
        </div>

        {/* Tagline */}
        <p
          className="text-xs tracking-widest uppercase text-[var(--sat-text-muted)] font-mono opacity-0 transition-opacity duration-300"
          style={{
            transitionTimingFunction: ready ? "ease-out" : "ease-in",
            ...(ready ? { opacity: 0.8 } : {}),
            transitionDelay: "160ms",
          }}
        >
          High-Performance Markdown Workspace
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
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.3s ease-out 200ms, transform 0.3s ease-out 200ms",
        }}
      >
        {isIndexing ? (
          <>
            <span className="w-4 h-4 border-2 border-[var(--sat-text-inverse)]/40 border-t-[var(--sat-text-inverse)] rounded-full animate-spin" />
            Indexing…
          </>
        ) : (
          <>
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
            Open a Vault
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
