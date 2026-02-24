import { useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { BootResult } from "../types";

// ---------------------------------------------------------------------------
// Hook input / output types
// ---------------------------------------------------------------------------

export interface UseVaultActionsReturn {
  isIndexing: boolean;
  status: string | null;
  setStatus: (msg: string | null) => void;
  pickAndSetVault: () => Promise<void>;
  reindexVault: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Owns the two vault-level mutations: picking a new vault folder and
 * triggering a full re-index of the current one.
 *
 * Both actions:
 *   1. Invoke the corresponding Rust command
 *   2. Call `router.invalidate()` so TanStack Router re-runs the loader —
 *      which re-fetches `boot` (including the fresh tree) and propagates the
 *      new state down to all consumers via props.
 *
 * This hook intentionally owns NO tree state — it just triggers invalidation
 * and lets the loader + `useVaultTree` handle the rest.
 */
export function useVaultActions(): UseVaultActionsReturn {
  const router = useRouter();
  const [isIndexing, setIsIndexing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ── Pick a new vault folder ───────────────────────────────────────────────

  const pickAndSetVault = useCallback(async () => {
    try {
      // Use the native Rust dialog command so we don't need the JS dialog plugin.
      const chosen = await invoke<string | null>("open_vault_dialog");
      if (!chosen) return;

      setIsIndexing(true);
      setStatus("Indexing vault…");

      await invoke<BootResult>("set_vault", { path: chosen });

      // Re-run the route loader — the new boot result (with fresh tree) will
      // flow down as updated loader data.
      await router.invalidate();
      setStatus(null);
    } catch (err) {
      console.error("[useVaultActions] set_vault failed:", err);
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsIndexing(false);
    }
  }, [router]);

  // ── Re-index the current vault ────────────────────────────────────────────

  const reindexVault = useCallback(async () => {
    try {
      setIsIndexing(true);
      setStatus("Re-indexing…");

      const result = await invoke<{ note_count: number }>("reindex_vault");

      // Re-run the loader so the fresh tree propagates to the sidebar.
      await router.invalidate();
      setStatus(`Re-indexed — ${result.note_count} notes.`);
    } catch (err) {
      console.error("[useVaultActions] reindex_vault failed:", err);
      setStatus(`Re-index error: ${String(err)}`);
    } finally {
      setIsIndexing(false);
    }
  }, [router]);

  return {
    isIndexing,
    status,
    setStatus,
    pickAndSetVault,
    reindexVault,
  };
}
