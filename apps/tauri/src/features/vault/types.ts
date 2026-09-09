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

/** Payload carried by a file-tree drag (drop into editor/canvas/other). */
export interface DraggedFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the vault root (no leading slash). */
  relPath: string;
  /** Display name — last path segment, e.g. `"intro.md"`. */
  name: string;
}

/** Returned by `autocomplete_links` — used for wikilink completion only. */
export interface LinkSuggestion {
  name: string;
  path: string;
}

/**
 * Mirrors `basalt_vault::BacklinkMention` — one line in a backlinking note
 * that contains a link resolving to the active note.
 */
export interface BacklinkMention {
  /** 1-based line number, matching the editor's line convention. */
  line: number;
  /** Trimmed excerpt of the line, ellipsized around the match. */
  excerpt: string;
}

/**
 * Mirrors `basalt_vault::BacklinkContext` — a backlinking note plus the
 * concrete mentions of the active note inside it.
 */
export interface BacklinkEntry {
  path: string;
  name: string;
  mentions: BacklinkMention[];
}

/** Mirrors `notes::TagCount` — one row in the Tags pane. */
export interface TagEntry {
  /** Tag name as written in notes (no leading `#`). */
  tag: string;
  /** Number of notes carrying this tag. */
  count: number;
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
  /** Rust boot phase durations in µs (TTI instrumentation, ADR-017). */
  timings: Record<string, number>;
  /** ADR-046: true when Tier 2 background indexing is in progress. */
  indexing: boolean;
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

/** Payload emitted on `vault://indexing-progress` Tauri event. */
export interface IndexingProgressPayload {
  total: number;
  indexed: number;
  percentage: number;
  phase: string;
}

/** Payload emitted on `vault://indexing-complete` Tauri event. */
export interface IndexingCompletePayload {
  total: number;
  duration_ms: number;
}
