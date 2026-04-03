# ADR-007: TypeScript vs Rust Responsibility Split

**Status:** Accepted  
**Date:** 2026-04-04

## Context

Basalt runs Rust via Tauri IPC. The question of what belongs in TypeScript vs Rust comes up constantly. Getting this wrong in either direction causes performance problems (JS doing heavy parsing) or over-engineering (Rust doing trivial UI logic).

## Decision

### TypeScript owns: UI semantics and interaction

- Tab open/close/pin/reorder logic
- Preview-to-pinned promotion rules
- Split/merge pane groups
- Focus history, keyboard interactions, command palette
- Workspace layout state (tab tree, group order, focused pane)
- Editor state: selected note, cursor, autosave timers, conflict detection UI

### Rust owns: Heavy I/O and compute

- `open_files(paths[])` — batched file reads
- `save_files([{path, content, expected_mtime}])` — batched writes with conflict checks
- `get_workspace_snapshot` / `save_workspace_snapshot` — atomic workspace state persistence
- Vault indexing: walk vault, extract metadata, build NoteGraph, maintain link graph
- Full AST parsing per file (`parse_markdown`) — on demand, not on every keystroke
- Filesystem watcher — event coalescing for changed/deleted files
- Search indexing — incremental inverted index
- Future: heavy parsing (math, syntax highlighting preload), compression/snapshots

### The rule

> If it allocates memory proportional to vault size, blocks on I/O, or runs more than once per second on a background task → Rust.  
> If it responds to a user gesture and completes in one event loop tick → TypeScript.

Never make N serial Tauri `invoke()` calls where one batched call works.

## Consequences

+ JS stays thin — no large allocations, no synchronous file I/O
+ Rust handles the vault at full native speed
- All Rust↔TS data must serialize/deserialize through JSON IPC — keep payloads compact
- Rust commands need careful versioning once workspace snapshot format stabilizes
