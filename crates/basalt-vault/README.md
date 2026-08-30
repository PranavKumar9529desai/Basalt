# basalt-vault — Vault & Filesystem Domain

Owns the vault/filesystem half of Basalt's backend: the in-memory `Vault`
(string arena + note graph), full-disk indexing, incremental mtime-based
reindexing, a persisted on-disk cache, a recursive debounced file watcher, and
vault-tree flattening.

Depends on `basalt-types`, `basalt-parser`, and `basalt-graph`. The native
filesystem dependencies (`ignore`) are gated with
`cfg(not(target_arch = "wasm32"))` — this is primarily a native crate.

## Modules

| Module        | Provides                                                              |
| ------------- | --------------------------------------------------------------------- |
| `vault`       | `Vault { arena: StringArena, graph: NoteGraph }`, `add_document` / `remove_document` |
| `cache`       | `VaultCache` + `CACHE_VERSION` (serialized save/load with an mtime map) |
| `indexer`     | `incremental_reindex(vault_path, vault, cached_mtimes)` — mtime-based   |
| `tree`        | `build_flat_tree`, `FlatTreeNode`, `NodeKind`                          |
| `watcher`     | `VaultWatcher::watch(...)` — notify-based, debounced                   |
| `path_utils`  | `resolve_creation_path(...)` — safe path/name resolution               |
| `utils`       | helpers + `FileSystem` trait (read/write/list abstraction)             |

## Public API

- `Vault` — the in-memory note repository (arena + graph)
- `VaultCache` — persistent index cache with a versioned format
- `incremental_reindex` — rebuild the vault from disk, skipping unchanged files
- `build_flat_tree` / `FlatTreeNode` — the flattened tree fed to the frontend
  file explorer
- `VaultWatcher::watch` — recursive file watching with debounce
- `resolve_creation_path` — safe name/path resolution for note creation
  (ADR-010)
- `FileSystem` — trait abstraction over the filesystem (testability)

## Documentation

- ADR-010: [Obsidian-Style Instant Note Creation](../../docs/adr/010-obsidian-style-note-creation.md)
- ADR-009: [Rust Crate Restructure](../../docs/adr/009-rust-crate-restructure.md)
