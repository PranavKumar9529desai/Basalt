import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type {
  AssetInfo,
  AuditReport,
  CleanupResult,
  ReorganizeResult,
} from "../types";

/** Fetch every non-markdown asset tracked in the vault. */
export function useAssetsIPC() {
  const fetchAssets = useCallback(() => invoke<AssetInfo[]>("get_assets"), []);

  const fetchAudit = useCallback(
    () => invoke<AuditReport>("get_asset_audit"),
    [],
  );

  /** Delete orphaned assets + consolidate duplicates. Returns counts. */
  const cleanup = useCallback(
    () => invoke<CleanupResult>("cleanup_assets"),
    [],
  );

  /** Bulk-reorganize all attachments per current org/naming rules. */
  const reorganize = useCallback(
    () => invoke<ReorganizeResult>("reorganize_assets"),
    [],
  );

  return { fetchAssets, fetchAudit, cleanup, reorganize };
}
