# Basalt Crates

Domain libraries for the Basalt backend. Pure Rust compute — no Tauri, no IPC, no
business state. Each crate owns one concern; dependencies flow downward only.

## Crate Map

```
basalt-types              (leaf — shared domain types, no basalt deps)
  ^
  |--- basalt-parser      (markdown parsing, frontmatter, link rewriting)
  |--- basalt-graph       (note-link graph, arena, force layout)
         ^         ^         ^
         |         |         |
    basalt-vault   |         |
      ^    ^       |         |
      |    |       |         |
  basalt-search  basalt-tables

frontmatter-wasm ──> basalt-parser, basalt-types    (wasm bridge)
graph-wasm ──> basalt-graph                          (wasm bridge)
```

| Crate | Purpose |
|---|---|
| `basalt-types` | Foundational data model: `MarkdownNode` AST, `Document`, `FileMetadata`, `TypedValue`, search result types |
| `basalt-parser` | Markdown → AST, metadata extraction, typed YAML frontmatter, wikilink rewriting |
| `basalt-graph` | Wiki-link/tag `NoteGraph`, string interning (`StringArena`), fuzzy matching, Barnes-Hut force layout |
| `basalt-vault` | In-memory vault, disk indexing, persistent cache, file watcher, tree flattening |
| `basalt-tables` | DQL query execution: FROM / WHERE / SORT / GROUP BY / FLATTEN / aggregates |
| `basalt-search` | Full-text (Tantivy) + fuzzy (Nucleo) search with lazy-commit indexing |
| `basalt-wasm/` | Wasm bridges: `frontmatter-wasm` and `graph-wasm` |

## File Structure

Every crate follows this layout:

```
crates/basalt-<name>/
├── Cargo.toml          ← crate metadata, dependencies, [dev-dependencies]
├── README.md           ← crate-specific API docs (points back here for rules)
├── benches/            ← Criterion benchmarks (named after what they measure)
│   └── <name>.rs
├── src/
│   ├── lib.rs          ← small: pub mod + pub use re-exports only
│   ├── <module>.rs     ← flat files for simple modules
│   └── <module>/       ← subdirectory for god-module splits
│       ├── mod.rs      ← entry point + re-exports
│       ├── <piece>.rs  ← decomposed responsibilities
│       └── tests.rs    ← dedicated test file (loaded via #[cfg(test)] mod tests;)
└── tests/              ← integration tests (optional, only basalt-tables uses this)
    └── <name>.rs
```

### Module patterns

| Pattern | When to use | Examples |
|---|---|---|
| Flat `foo.rs` | Single concern, ≤ 450 loc | `arena.rs`, `fuzzy.rs`, `page_row.rs` |
| `foo.rs` + `foo/` | God-module split (was ≥ 500 loc) | `query/`, `graph_layout/`, `asset_index/`, `tantivy/` |
| `tests/` dir | Integration tests that import the public API | `basalt-tables/tests/` |

Subdirectories always use `mod.rs` as the entry point. `mod.rs` owns
`pub use` re-exports so `lib.rs`'s `pub mod` stays unchanged.

### Test locations

| Strategy | Where | Used by |
|---|---|---|
| Inline `#[cfg(test)] mod tests` | Same file, bottom | Most crates (quick unit tests) |
| Dedicated `tests.rs` in submodule | `module/tests.rs`, loaded via `mod tests;` under `#[cfg(test)]` | `basalt-parser/query/`, `basalt-graph/graph_layout/`, `basalt-vault/asset_index/` |
| Integration `tests/` dir | `crates/<name>/tests/` | `basalt-tables` (all 81 tests here, zero inline) |

New code should prefer **inline `#[cfg(test)]`** for unit tests (colocated
with the code they test). Use a dedicated `tests.rs` when the test block
exceeds ~100 lines. Use the `tests/` directory only for integration tests
that exercise the public API surface.

### Benchmarks

Live in `benches/` at the crate root. Named after what they measure
(`query_execution.rs`, `search_query.rs`), not generic `bench1.rs`.

| Crate | Benchmarks |
|---|---|
| `basalt-graph` | `graph_step`, `arena_growth`, `graph_query`, `graph_insert` (4) |
| `basalt-search` | `search_query`, `search_reindex`, `index_docs` (3) |
| `basalt-vault` | `index_walk`, `cache_roundtrip` (2) |
| `basalt-parser` | `parse_metadata` (1) |
| `basalt-tables` | `query_execution` (1) |
| `basalt-types` | — (shared types, no hot paths) |
| `basalt-wasm/*` | — (thin shims) |

Run with: `cargo bench --bench <name> -p basalt-<crate>`

## Coding Rules

These are the mandatory conventions for all code in `crates/`.
Full rationale: [CONVENTIONS.md §12](../CONVENTIONS.md) · [ADR-030](../docs/adr/030-rust-crates-quality-refactor.md).

### File & Function Budgets

| Unit | Soft limit | Must split |
|---|---|---|
| File | ≤ 450 loc | 500+ loc |
| Function | ≤ 40 loc | 90+ loc, deep nesting, 2+ abstraction levels |
| `impl` block | one concern | mixed unrelated behavior |
| Match arm | a few lines | mini-program inside each arm |

Split when: nesting deepens, control flow is hard to scan, a function both
decides policy and performs mechanics, or variable lifetimes get long.

Module layout: prefer `foo.rs` + `foo/` over `mod.rs`.
`lib.rs` is small — `pub mod` + `pub use` re-exports only.
Use `pub(crate)` over bare `pub` for internal helpers.

### Error Handling

- **Never** return `Result<T, String>`.
- Domain crates own a `thiserror` enum per fallible concern with
  `#[error("...")]` Display and `#[from]`/`#[source]` for wrapped sources.
- **No silent degradation**: ban `.unwrap_or_default()` / `.ok()` /
  `let _ = result` that swallows a real failure. Return a typed error or
  `tracing::warn!` at minimum.
- **Panics are a bug or a provable invariant.** `expect("reason")`, never
  bare `unwrap()`, never on user-controllable state.
- Add `#[must_use]` on public fallible/`Result`/`Option` returns and key
  value types.

### Newtypes & Types

- Important domain scalars are **newtypes** (`pub struct NodeId(u32)`),
  not aliases (`pub type NodeId = u32`).
- Encode invariants in types: validated `new()`/`try_new()` constructors so
  empty/invalid states are unrepresentable.
- Replace `String` closed-sets with serialized **enums** (e.g.
  `QueryColumn.type_` is `Text|Number|Date|Checkbox|Link|List`).
- Public enums that grow get `#[non_exhaustive]`.
- **Borrow by default**: take `&str`/`&[T]`, return `&str`/`Cow<'_, str>`.
  Reserve `String` for long-lived storage.

### Macros

Function/generic first, then `macro_rules!`, then (rarely) proc macros.
Keep expansions small, Rust-shaped, and free of nonlocal control flow.

### Performance

- **Reuse / pre-size**: `with_capacity`, `.clear()` reuse, scratch buffers
  as struct fields.
- **Zero-copy / borrow** in hot paths: `&str`/`Cow`,
  `eq_ignore_ascii_case` instead of `to_lowercase()`.
- **Algorithmic before micro**: O(N)/O(log n) over quadratic.
- **Measure, don't guess.** Criterion at 5k and 25k fixtures;
  `cargo flamegraph` to confirm the target is hot.

### DRY

One source of truth per concept. `TypedValue` is the single cell-value type.
One YAML converter, one date classifier, one `stem_from_path`, one wikilink
scanner — shared helpers, never copy-paste.

### Lint & Tooling

- `cargo fmt --all` on every commit.
- `clippy.toml` at workspace root with committed thresholds.
- CI: `cargo clippy --workspace --all-targets -- -D warnings`.
- `cargo test --workspace` must be green.

## Verification (every change)

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

For performance-claiming changes, also run Criterion benches at 5k and 25k
fixtures and verify no regression.
