# ADR-009: Rust Crate Restructure — Hyphenated Names, Single Responsibility

**Date:** 2026-04-04  
**Status:** Accepted

## Context

The original Rust backend had four crates:

- `basalt_core` — a catch-all containing markdown parsing, AST types, NoteGraph, StringArena, fuzzy search, and UTF-16 mapping
- `basalt_fs` — vault management (misnamed; it did much more than filesystem I/O)
- `basalt_search` — Tantivy + Nucleo search
- `basalt_wasm` — WASM bindings

Problems:

1. `basalt_core` violated single-responsibility — unrelated concerns in one crate made the dependency graph harder to reason about
2. `basalt_fs` was misleading — it managed the entire vault lifecycle, not just filesystem operations
3. Underscore package names deviate from Rust ecosystem convention (crates.io uses hyphens)

## Decision

Restructure into six crates with hyphenated package names:

| Crate           | Responsibility                                                                           |
| --------------- | ---------------------------------------------------------------------------------------- |
| `basalt-types`  | Shared data types: `Document`, `MarkdownNode`, `FileMetadata`, search result types       |
| `basalt-parser` | Markdown parsing, frontmatter extraction, inline parsing, UTF-16 mapping                 |
| `basalt-graph`  | `StringArena`, `NoteGraph`, fuzzy search algorithm                                       |
| `basalt-vault`  | Vault indexing, incremental reindex, file watching, cache, tree building, path utilities |
| `basalt-search` | Full-text search (Tantivy BM25) and fuzzy file matching (Nucleo)                         |
| `basalt-wasm`   | `wasm-bindgen` surface exposing parser/graph to JavaScript                               |

Dependency order:

```
basalt-types → basalt-parser → basalt-graph → basalt-vault → basalt-search
                                    ↑
                               basalt-wasm
```

## Rationale

- **Single responsibility**: each crate has one clear job
- **Readable layering**: the dependency order is immediately obvious from names
- **Hyphenated names**: matches Rust ecosystem convention (tokio, serde, axum all use hyphens); Cargo auto-maps `basalt-vault` → `basalt_vault` in `use` statements
- **`basalt-vault` rename**: accurately communicates that this manages the vault abstraction, not just raw filesystem I/O

## Consequences

- All `use basalt_core::` imports replaced with targeted imports from `basalt-types`, `basalt-parser`, or `basalt-graph`
- `use basalt_fs::` replaced with `use basalt_vault::`
- `src-tauri` Cargo.toml updated with new dependency names
- Pre-existing tree builder test failures (4 tests using synthetic paths that failed a `.exists()` guard) were fixed as part of this work by using `tempfile::TempDir`
