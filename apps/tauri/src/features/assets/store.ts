import { useCallback } from "react";
import { create } from "zustand";
import type { AssetFilter, AssetInfo, AuditReport } from "./types";
import { useAssetsIPC } from "./hooks/useAssetsIPC";

interface AssetsStore {
  assets: AssetInfo[];
  filter: AssetFilter;
  search: string;
  showDuplicatesOnly: boolean;
  showOrphansOnly: boolean;
  auditReport: AuditReport | null;
  loading: boolean;

  setFilter: (f: AssetFilter) => void;
  setSearch: (s: string) => void;
  setShowDuplicatesOnly: (v: boolean) => void;
  setShowOrphansOnly: (v: boolean) => void;
  setAssets: (a: AssetInfo[]) => void;
  setAuditReport: (r: AuditReport | null) => void;
  setLoading: (v: boolean) => void;
}

export const useAssetsStore = create<AssetsStore>()((set) => ({
  assets: [],
  filter: "all",
  search: "",
  showDuplicatesOnly: false,
  showOrphansOnly: false,
  auditReport: null,
  loading: false,

  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  setShowDuplicatesOnly: (showDuplicatesOnly) => set({ showDuplicatesOnly }),
  setShowOrphansOnly: (showOrphansOnly) => set({ showOrphansOnly }),
  setAssets: (assets) => set({ assets }),
  setAuditReport: (auditReport) => set({ auditReport }),
  setLoading: (loading) => set({ loading }),
}));

/**
 * Derive the filtered, searchable asset list from the store.
 * Returns a new array on every call — memoize in the consumer if needed.
 */
export function useFilteredAssets(): AssetInfo[] {
  return useAssetsStore((s) => {
    let list = s.assets;

    // Filter by type
    if (s.filter !== "all") {
      list = list.filter((a) => a.file_type === s.filter);
    }

    // Orphans only
    if (s.showOrphansOnly) {
      list = list.filter((a) => a.embeds_by.length === 0 && a.linked_by.length === 0);
    }

    // Duplicates only — group by content_hash, keep groups with >1 member
    if (s.showDuplicatesOnly) {
      const counts = new Map<string, number>();
      for (const a of s.assets) {
        if (a.content_hash) {
          counts.set(a.content_hash, (counts.get(a.content_hash) ?? 0) + 1);
        }
      }
      list = list.filter(
        (a) => a.content_hash && (counts.get(a.content_hash) ?? 0) > 1,
      );
    }

    // Search by filename
    if (s.search.trim()) {
      const q = s.search.toLowerCase();
      list = list.filter((a) => a.file_name.toLowerCase().includes(q));
    }

    return list;
  });
}

/**
 * Load assets and audit report from the Rust backend.
 * Call from the AssetsView component on mount / refresh.
 */
export function useAssetsActions() {
  const { fetchAssets, fetchAudit, cleanup, reorganize } = useAssetsIPC();
  const { setAssets, setAuditReport, setLoading } = useAssetsStore.getState();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [assets, audit] = await Promise.all([fetchAssets(), fetchAudit()]);
      setAssets(assets);
      setAuditReport(audit);
    } catch (err) {
      console.error("[assets] refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAssets, fetchAudit]);

  const runCleanup = useCallback(async () => {
    try {
      await cleanup();
      // Refresh after cleanup to update the list.
      await refresh();
    } catch (err) {
      console.error("[assets] cleanup failed:", err);
    }
  }, [cleanup, refresh]);

  const runReorganize = useCallback(async () => {
    try {
      await reorganize();
      // Refresh after reorganize to update paths + embeds.
      await refresh();
    } catch (err) {
      console.error("[assets] reorganize failed:", err);
    }
  }, [reorganize, refresh]);

  return { refresh, runCleanup, runReorganize };
}
