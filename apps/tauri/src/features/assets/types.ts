/** Mirror of the Rust FileType enum — classification by extension. */
export type AssetType = "image" | "video" | "audio" | "document" | "other";

/** Mirror of the Rust AssetInfo struct. */
export interface AssetInfo {
  rel_path: string;
  abs_path: string;
  file_name: string;
  file_type: AssetType;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  width: number | null;
  height: number | null;
  embeds_by: string[];
  linked_by: string[];
}

/** Consistency audit report from `get_asset_audit`. */
export interface AuditReport {
  orphan_count: number;
  duplicate_count: number;
  broken_embed_count: number;
  assets: AssetInfo[];
}

/** Active filter tab in the assets panel. */
export type AssetFilter = "all" | AssetType;

/** Result of the cleanup_assets command. */
export interface CleanupResult {
  orphans_deleted: number;
  duplicates_deleted: number;
}
