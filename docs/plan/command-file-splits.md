# Plan: Split oversized `src-tauri/commands/` files into module directories

## Goal

Break the four largest command files into focused submodules, keeping the
existing public API surface unchanged. Every `#[tauri::command]` function
stays at its current import path (`commands::assets::cleanup_assets`, etc.)
via `mod.rs` re-exports.

## Current state

| File         | Lines | Main responsibilities                                             |
| ------------ | ----- | ----------------------------------------------------------------- |
| `assets.rs`  | 1122  | cleanup, reorganize, save attachment, date helpers, tests         |
| `notes.rs`   | 896   | backlinks, autocomplete, create, rename (wikilink rewrite), tests |
| `folders.rs` | 785   | create, delete, move, rename (path rewrite), tests                |
| `vault.rs`   | 513   | reindex, tree, dialog, **graph snapshot** (186 LOC of tests)      |

All four have large test modules (200–300 LOC each) that are prime candidates
for extraction.

## DRY: shared `temp_vault()` test helper

Three files (`assets.rs`, `notes.rs`, `folders.rs`) define near-identical
`temp_vault()` helpers. Extract one canonical version into `common.rs`
(`#[cfg(test)] pub(crate)`). Each test module drops its local copy and calls
`super::super::common::tests::temp_vault()` (or `crate::commands::common::tests::temp_vault()`).

---

## Split 1: `assets.rs` → `assets/` module directory

```
commands/assets/
├── mod.rs           ← re-exports + thin wrappers (get_assets, get_asset_audit, cleanup_assets, reorganize_assets, save_attachment)
├── cleanup.rs       ← CleanupResult, cleanup_assets_impl
├── reorganize.rs    ← ReorganizeResult, reorganize_assets_impl, rewrite_asset_embeds, strip_last_ext
├── save.rs          ← SaveAttachmentResult, save_attachment impl, infer_ext_*, strip_ext_from_name, date helpers
└── tests.rs         ← all #[cfg(test)] (calls common::tests::temp_vault)
```

**mod.rs** keeps the 5 `#[tauri::command]` fns as thin wrappers that delegate
to the `_impl` functions in submodules. This is the same pattern already used
for `cleanup_assets` / `cleanup_assets_impl`.

**No changes to `lib.rs`** — the `mod assets;` path resolves identically for
file vs directory module.

## Split 2: `notes.rs` → `notes/` module directory

```
commands/notes/
├── mod.rs           ← re-exports + thin wrappers (get_backlinks, autocomplete_*, create_note, create_untitled_note, rename_note)
├── link.rs          ← LinkSuggestion, get_backlinks_impl, autocomplete_links_impl, autocomplete_tags_impl
├── create.rs        ← CreateNoteResult, create_note logic, create_untitled_note logic, sanitize_name
├── rename.rs        ← RenameNoteResult, rename_note_impl, rename_attachments_for_note
└── tests.rs         ← all #[cfg(test)] (calls common::tests::temp_vault, common::tests::temp_vault_with_self_refs)
```

`rename_attachments_for_note` stays in `rename.rs` (tightly coupled to rename
logic — it's a private helper, not a separate concern).

## Split 3: `folders.rs` → `folders/` module directory

```
commands/folders/
├── mod.rs           ← re-exports + thin wrappers (create_folder, delete_file, delete_paths, move_paths, rename_path)
├── delete.rs        ← apply_delete_paths (shared by delete_file + delete_paths)
├── move.rs          ← move_paths impl
├── rename.rs        ← RenamePathResult, rename_path_impl, sanitize_path_name, resolve_rename_target_name, rel_prefix
└── tests.rs         ← all #[cfg(test)] (calls common::tests::temp_vault_with_folder)
```

`delete_file` / `delete_paths` share `apply_delete_paths` — keep both in
`delete.rs`.

## Split 4: `vault.rs` → `vault/` module directory

```
commands/vault/
├── mod.rs           ← re-exports + thin wrappers (reindex_vault, get_vault_tree, open_vault_dialog, get_graph)
├── graph.rs         ← GraphSnapshot, GraphNodeMeta, build_graph_snapshot, cc_find
└── tests.rs         ← graph snapshot tests
```

The graph snapshot is logically separate from vault lifecycle (reindex/tree).
`build_graph_snapshot` is already `pub(crate)` — it stays accessible.

## Execution order

1. Add `temp_vault()` + `temp_vault_with_self_refs()` to `common.rs`
2. Split `vault.rs` (smallest, least risk, graph extraction is clean)
3. Split `folders.rs`
4. Split `notes.rs`
5. Split `assets.rs` (largest — do last)
6. After each split: `cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
7. Final: `cargo fmt --all --check`

## Verification invariant (after every split)

```
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo fmt --all --check
```

## Commit

Single commit: `refactor(rust): split oversized commands/ files into module directories`
