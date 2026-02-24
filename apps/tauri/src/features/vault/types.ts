// ---------------------------------------------------------------------------
// Mirrors Rust structs from basalt_fs::tree and tauri/src-tauri/src/lib.rs
// Keep these in sync with the Rust side — serde(rename_all = "camelCase")
// is applied on the Rust structs so all fields arrive in camelCase.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Editor / link types
// ---------------------------------------------------------------------------

/** Returned by `autocomplete_links` — used for wikilink completion only. */
export interface LinkSuggestion {
  name: string;
  path: string;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "conflict";

// ---------------------------------------------------------------------------
// Tauri command response types
// ---------------------------------------------------------------------------

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
  /** Persisted settings from config.json */
  settings: Record<string, unknown>;
}

/**
 * Payload emitted on the `vault://file-changed` Tauri event.
 * Richer than a raw path string so the frontend can react precisely.
 */
export interface FileChangeEvent {
  path: string;
  /** "created" | "modified" | "deleted" */
  kind: "created" | "modified" | "deleted";
}
