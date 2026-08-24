/**
 * Mirrors Rust structs from basalt_fs::tree and lib.rs. serde(rename_all =
 * "camelCase") is applied on the Rust side — keep both sides in sync.
 */

export type NodeKind = "file" | "folder";

/**
 * A single row in the pre-order DFS flat tree built by Rust.
 * The frontend never constructs or sorts this — it only filters it
 * based on which folders the user has opened.
 */
export interface FlatTreeNode {
  /** Display name — last path segment, e.g. `"api.md"` or `"docs"`. */
  name: string;

  /** Absolute path on disk — used for all `invoke()` file commands. */
  path: string;

  /**
   * Path relative to the vault root — used to look up parent folders.
   * e.g. `"docs/api/intro.md"` or `"docs/api"` for a folder.
   * Never has a leading slash.
   */
  relPath: string;

  /** Whether this node is a file or a directory. */
  kind: NodeKind;

  /** Indentation level (0 = immediate child of vault root). */
  depth: number;

  /** Number of immediate children. Always 0 for files. */
  childCount: number;
}

/** Returned by `autocomplete_links` — used for wikilink completion only. */
export interface LinkSuggestion {
  name: string;
  path: string;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "conflict";

/**
 * Returned by both `boot` and `set_vault`.
 * The `tree` field lets the frontend populate the sidebar in a single
 * round-trip without a separate `get_vault_tree` call on startup.
 */
export interface BootResult {
  vault_path: string | null;
  note_count: number;
  /** One of: "no_vault" | "loaded_cache" | "incremental" | "full_index" */
  status: string;
  /** Pre-sorted flat tree, empty when status === "no_vault". */
  tree: FlatTreeNode[];
  /** Persisted settings from config.json (Tier 1: global) */
  settings: Record<string, unknown>;
  /** Per-vault workspace state from .basalt/workspace.json (Tier 3: vault-local) */
  workspace: Record<string, unknown>;
}

/**
 * Payload emitted on the `vault://file-changed` Tauri event.
 * Richer than a raw path string so the frontend can react precisely.
 */
export interface FileChangeEvent {
  path: string;
  /** "created" | "modified" | "deleted" */
  kind: "created" | "modified" | "deleted";
  /** false for content-only saves (no tree change), true for structural changes */
  needsTreeRefresh: boolean;
}

/** Returned by `create_note` Rust command. */
export interface CreateNoteResult {
  path: string;
  name: string;
}
