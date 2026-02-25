# Basalt

Basalt is a Rust core for Obsidian-style Markdown parsing, fast vault metadata indexing, and link graph construction, with optional WASM bindings.

## Workspace Layout
- `crates/basalt_core`: Markdown parsing, metadata extraction, graph, UTF-16 mapping
- `crates/basalt_fs`: Vault indexing and filesystem watcher
- `crates/basalt_wasm`: WASM bindings for rendering + metadata
- `apps/tauri`: UI shell (placeholder)
- `docs/architecture.md`: System overview
- `scratch/`: Generated artifacts and debug outputs

## Quick Notes
- Vault indexing uses **metadata extraction**, not full AST parsing.
- Full AST parsing is **per-file** via `parse_markdown`.
- Offsets for tags/links/headings are stored in UTF-16 for editor compatibility.


