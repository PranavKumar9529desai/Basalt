# ADR-030: Rust Crates Quality Refactor — Practices, Structure, and Plan

> Status: **Accepted — implemented across phases 0–5** (with a short list of
> remaining items tracked below). This ADR began as a grounded refactor plan;
> the code now matches the target architecture described here.

---

## 1. Why "our Rust feels messy"

The review surfaced four systemic causes, not isolated style nits:

1. **God modules.** `query.rs` (834 loc), `asset_index.rs` (614), `graph_layout.rs`
   (685), and `engine.rs:execute_query` each mixed several responsibilities in one
   file. The rule we adopted: **module first, crate last; split a file by
   responsibility; the compiler then enforces the boundary for you.**
2. **Inconsistent error handling.** Crates were split between typed errors,
   `anyhow`, bare `Option`, and silent degradation
   (`.unwrap_or_default()`, `let _ = flush_pending()`). The rule: libraries
   expose a `thiserror` enum (callers match variants); applications wrap with
   `anyhow` at the boundary; never `anyhow` in a library public API, never
   `Result<_, String>`.
3. **Duplicate knowledge (DRY).** `TypedValue` vs `FrontmatterValue`, two YAML
   converters, two divergent date detectors, three `[[`-scanners, copy-pasted
   `contains`, `register_embeds`/`register_links`.
4. **Allocations & hot-path waste.**

## 2. Rust practices adopted (grounded, 2026)

The playbook. Each item is a boring, standard Rust idiom — catching up to
conventions, not being clever.

### 2.1 File/module structure

- Split files by responsibility: `foo.rs` → `foo/{mod,pieces}.rs`; budgets:
  file ≤ ~450 loc soft / 500+ smell; function ≤ ~40 loc; an `impl` block holds
  **one** concern.
- **`lib.rs` is small and intentional** — `pub mod` + `pub use` re-exports only.
- **`pub(crate)` over bare `pub`** for internal helpers.

### 2.2 Error handling

- Every library crate has a `#[derive(thiserror::Error)]` enum with
  `#[error("...")]` Display messages and `#[from]`/`#[source]` for wrapped
  sources. Variants exist per caller-branch, not per message.
- `anyhow` only at the app boundary (`apps/tauri`).
- No silent degradation in library code: indexer read errors and flush
  failures log; `cache.rs` keeps its `Option` `load()` (see remaining items).
- Panics are a bug or a provable invariant. `expect("...")` with the reason,
  never bare `unwrap()`, and never on user-controllable state.
- `#[must_use]` on public fallible/`Result`/`Option` returns and key value
  types.

### 2.3 Newtypes and the type system

- `type NodeId = u32` → a real `pub struct NodeId(u32)` with derived `Copy`,
  `Eq`, `Hash`, `Ord`, and `#[serde(transparent)]` (wire-compatible).
- `QueryColumn.type_: String` → a closed serialized `QueryColumnType` enum
  (`text|number|date|checkbox|link|list`).
- Field accessors aim for a named `FieldPath` (not yet shipped — see
  remaining items).
- Keep enums that grow `#[non_exhaustive]` so downstream `match`es force a
  `_` arm.
- Borrow-by-default API design: take `&str`/`&[T]`, return `&str`/`Cow<'_, str>`
  where ownership isn't required.

### 2.4 Macros — judicious, not clever

Macros are a last resort, best for syntax a function can't produce. Prefer
function/generic first, then `macro_rules!`, then (rarely) proc; keep
expansions small and Rust-shaped.

### 2.5 Performance

- Reuse/pre-size collections: `with_capacity`, `.clear()` reuse, scratch
  buffers instead of per-frame `Vec` rebuilds.
- Zero-copy / borrow in hot paths: `&str` returns, `Cow`,
  `eq_ignore_ascii_case` instead of `to_lowercase()`.
- Algorithmic fixes before micro-opts: HashMap-indexed O(N) `group_rows`,
  `partition_point` for the snippets byte→char map.
- **Measure, don't guess.** Perf changes are gated on Criterion benches at
  5k and 25k fixtures.

### 2.6 Lint / tooling hygiene

- `clippy.toml` at workspace root (cognitive-complexity, too-many-arguments,
  type-complexity thresholds).
- `cargo clippy --workspace --all-targets -- -D warnings` is clean and wired
  into CI (`.github/workflows/ci.yml`, alongside `cargo test --workspace`);
  `bun run lint:rust` runs clippy + tests locally.
- `cargo fmt --all --check` clean in dev (no fmt gate in CI yet — see
  remaining items).

## 3. What was actually wrong, by crate

The four deep reviews that produced this plan. Each row summarizes the
findings and their disposition (✓ fixed, ✗ remaining).

| Crate           | Findings / disposition                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basalt-parser` | `query.rs` god module → ✓ split into `query/{mod,ast,parse,tests}.rs`. Hand-rolled `source_not/and/or` (incl. dead `_offset`) → ✗ still present in `query/parse.rs`; `unwrap_or(0)` swallows bad LIMIT → ✗ still present; `PartialEq` on `f64` → ✗ still present. `metadata.rs` 223-loc fn → ✓ decomposed (`parse_frontmatter` + `scan_body_tokens` + small scanners). |
| `basalt-vault`  | `asset_index.rs` god module → ✓ split into `asset_index/{mod,file_type,info,hash,tests}.rs`. `register_embeds`/`register_links` near-identical → ✗ still duplicated. `resolve_asset` `eq_ignore_ascii_case` ✓; `broken_embed_count` (dead, always 0) removed ✓; `infer_mime_type` → `&'static str` ✓. `cache.rs load()` collapses failures to `None` → ✗ still `Option`. `md5` crate outdated → ✗ `md5 = "0.7"` still in use. |
| `basalt-graph`  | `graph_layout.rs` god module → ✓ split into `graph_layout/{mod,params,layout_graph,force_graph,tests}.rs`. Double `to_string()` in `arena::get_or_insert` → ✗ still two allocations. `reorder_tree` scratch buffers ✓; `NodeId` bare alias → ✓ newtype; dead `let _ = (&bx, &by)` removed ✓.                                                                              |
| `basalt-search` | `anyhow` → ✓ typed `SearchError` (thiserror, Io/Tantivy from-variants). `AhoCorasick` rebuilt per doc → ✓ hoisted `TermMatcher` (one per query). O(n²) snippets byte→char → ✓ `partition_point`. `build_schema` opaque 5-tuple → ✗ unchanged; `TantivyIndex::new` 7-arg → ✗ unchanged. `let _ = flush_pending()` → ✓ `flush_best_effort` logs.                            |
| `basalt-tables` | `execute_query` returns `ParseError` → ✓ `DqlError` (`thiserror`, `#[from] ParseError`, `Result<QueryResult, DqlError>`). Real `expect` panic → ✓ `first_page` returns `Option`. O(N·G) `group_rows` → ✓ HashMap-indexed O(N). `type_` as `String` → ✓ `QueryColumnType`. `compare_typed` cross-type `Equal` conflation → ✓ fixed by the HashMap grouper keying. Deterministic default sort → ✗ un-SORTed output keeps arena/link order. |
| `basalt-wasm`   | `graph_build` trusts caller pointer + clamps vs last buffer (UB class) → ✓ derives its slice from the owned `EDGE_BUF` via an offset param with `assert_eq!` + SAFETY doc. Two subcrates still solve alloc/parse two different ways → ✗ not unified; duplicated `[profile.release]` → ✓ consolidated at workspace root.                                                           |
| `basalt-types`  | Two parallel typed-value systems → ✓ collapsed into one internally-tagged `TypedValue` (below); `FrontmatterValue::None => PropertyType::Text` lie → ✓ `property_type() -> Option<PropertyType>`; `Document`/`FileMetadata` Default/`new()` duplication ✓.                                                                                                              |

### 3.1 The highest-ROI change (value-type unification)

`TypedValue` (internally-tagged serde: `{"type":"text","value":...}`) and
`FrontmatterValue` (externally-tagged camelCase) modeled the identical domain
concept with two incompatible JSON shapes, two divergent YAML converters, and
two date detectors.

**Decision (implemented):** one internally-tagged `TypedValue` enum in
`basalt-types` (`FrontmatterValue` is now a type alias). One shared
`yaml_to_typed` converter (date + datetime + wikilink classification) in
`query.rs`; the parser's `yaml_to_value`/`infer_string`/`is_iso_*`/
`first_wikilink_target` were deleted in favour of it. A `DateTime` variant
(serde `datetime`) was added for frontmatter date-times; `GroupKey::from_typed`
folds it onto `Date`; `None → Null`. The frontend mirrors
(`packages/editor/src/types.ts`, `frontmatter-utils.ts`, `frontmatter-widget.ts`,
`features/editor/types/query.ts`) were updated to the internally-tagged shape.

## 4. What shipped, by phase

**Verification invariant (every phase):** `cargo test --workspace`,
`cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --check`,
plus `bunx tsc --noEmit` / `bun run lint` when TS mirrors change; 25k
Criterion benches for perf-claiming changes.

### Phase 0 — Baseline safety ✓

- `basalt-tables`: `DqlError` (`thiserror`, `#[from] ParseError`);
  `execute_query -> Result<QueryResult, DqlError>`; the `members.first().expect`
  panic replaced with an `Option`-returning `first_page`.
- `basalt-graph`: dead `let _ = (&bx, &by);` removed.
- `basalt-vault`: always-zero `broken_embed_count` removed;
  `FrontmatterValue::None => PropertyType::Text` lie fixed.
- `basalt-wasm`: `graph_build` derives its slice from the owned `EDGE_BUF` via
  an offset param (UB class removed).

### Phase 1 — Module decomposition ✓

- `basalt-parser/src/query/` — `mod.rs` (entry + re-exports), `ast.rs`,
  `parse.rs`, `tests.rs`.
- `basalt-vault/src/asset_index/` — `mod.rs`, `file_type.rs`, `info.rs`,
  `hash.rs`, `tests.rs`.
- `basalt-graph/src/graph_layout/` — `mod.rs`, `params.rs`, `layout_graph.rs`,
  `force_graph.rs`, `tests.rs`.
- `basalt-tables/src/engine.rs` `execute_query` split into per-`QueryType`
  handlers + `link_row()`.
- `basalt-parser/src/metadata.rs` decomposed via `parse_frontmatter` +
  `scan_body_tokens`.

### Phase 2 — Value-type unification ✓

As described in §3.1. Wire contract verified by a serde round-trip test
asserting the exact internally-tagged JSON.

### Phase 3 — Error handling + idiomatic types (partially shipped)

- ✓ `SearchError` (typed, no `anyhow`); `NodeId` newtype; `QueryColumnType`
  closed enum.
- ✗ not shipped: `VaultError` (crate has `CacheError`, `PathError` only);
  `FieldPath` (still `FieldRef(Vec<String>)`); `#[non_exhaustive]`;
  `Display`/`FromStr` for `QueryPlan`/`CompareOp`/`FileType`; `#[must_use]`
  pass; `Display` for `Expr` (still `expr_text`); `compare_typed`/`is_truthy`
  still live in `basalt-tables/src/expr.rs`.

### Phase 4 — Performance + determinism (partially shipped)

- ✓ `group_rows` HashMap-indexed O(N) grouper; `resolve_asset`
  `eq_ignore_ascii_case`; scratch buffers in `reorder_tree`;
  `partition_point` in snippets; `AhoCorasick` hoisted into a per-query
  `TermMatcher`; `infer_mime_type` → `&'static str`.
- ✗ not shipped: single `to_string()` in `arena::get_or_insert` (still two
  allocations); deterministic default sort for un-SORTed DQL.
- Gated on Criterion at 5k **and** 25k.

### Phase 5 — Hygiene / conventions (partially shipped)

- ✓ `clippy.toml` at workspace root with the specified thresholds; clippy at
  `-D warnings` clean and in CI; `bun run lint:rust` wired; AGENTS.md +
  CURRENT_WORK.md updated.
- ✗ not shipped: unified benchmark fixtures (`benches/common.rs` — generators
  remain inline per bench); a `cargo fmt` gate in CI.

### Remaining items (open debt, not docs-claimed complete)

- `basalt-parser`: `source_not/and/or` simplification, bad-LIMIT handling,
  `PartialEq` on `f64`.
- `basalt-vault`: `register_embeds`/`register_links` dedup, `VaultCache::load`
  error channel, `md5` crate upgrade.
- `basalt-graph`: single-alloc `arena::get_or_insert`.
- `basalt-search`: `SchemaFields` struct for `build_schema`, slimmer
  `TantivyIndex::new`.
- `basalt-tables`: deterministic default sort.
- `basalt-wasm`: unify the two alloc/parse patterns.
- `basalt-types`/tables: Phase-3 type-safety pass (FieldPath, `Display`/
  `FromStr`, `must_use`, `Expr` Display, `compare_typed`/`is_truthy` move).
- Phase 5: `benches/common.rs`, fmt gate in CI.

---

## 5. Research sources consulted

Consolidated, not cited-inline, to keep the doc readable.

- **Error handling:** thiserror/anyhow 2026 guides — unanimous on
  _libraries=thiserror, applications=anyhow, `#[from]`/`#[source]`, never
  `Result<_, String>`, `#[non_exhaustive]`, `#[must_use]`_. Rust API guidelines.
- **Macros:** Microsoft Pragmatic Rust Guidelines; Effective Rust Item 28.
- **Performance:** Microsoft Pragmatic Rust Performance guidelines; 2026
  allocation/borrowed-strings case studies (profiling-first, `format!`/
  `to_string`-in-loop).
- **Structure/hygiene:** rustfaq maintainability guide; clippy lint-config +
  `clippy.toml` thresholds; modern `foo.rs`+`foo/` layout, thin `lib.rs`,
  `pub(crate)`.

---

## 6. Decisions locked

- **Scope:** all phases 0–5 end-to-end.
- **Value unification serde shape:** internally-tagged form (matches the
  frontend `query.ts` consumer); `packages/editor` mirrors updated in the same
  effort.
- **Execution is complete except the remaining items listed in §4.**