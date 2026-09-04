# ADR-030: Rust Crates Quality Refactor — Practices, Structure, and Plan

> Status: **Draft for review** (no code changed yet)
>
> This ADR grounds the refactor plan in (a) a survey of current Rust
> community/ecosystem practice (2026) and (b) a line-by-line reading of our own
> `crates/*`. It is **not** a rewrite-for-its-own-sake: every change is tied to
> a concrete readability, correctness, or performance win measured at
> super-large vault scale (~25k notes), per the repo standard.

---

## 1. Why "our Rust feels messy"

The review surfaced four systemic causes, not isolated style nits:

1. **God modules.** `query.rs` (834 loc), `asset_index.rs` (614), `graph_layout.rs`
   (685), and `engine.rs:execute_query` each mix several responsibilities in one
   file. Community guidance across 2026 sources is unanimous: **module first,
   crate last; split a file by responsibility; the compiler then enforces the
   boundary for you.** "Small surfaces win: thin APIs, thin modules, thin
   functions."
2. **Inconsistent error handling.** The repo already uses `thiserror` in
   `basalt-parser/query.rs` and `basalt-vault/path_utils.rs`, but the crates are
   split between typed errors, `anyhow`, bare `Option`, and silent degradation
   (`.unwrap_or_default()`, `let _ = flush_pending()`). The 2026 consensus
   (multiple sources, incl. the Rust API guidelines) is a firm rule:
   - **Libraries expose a `thiserror` enum** — callers can match on variants.
   - **Applications wrap those with `anyhow` + `.context()`** at the boundary.
   - Never `anyhow` in a library *public* API; never return `Result<_, String>`.
3. **Duplicate knowledge (DRY).** `TypedValue` vs `FrontmatterValue`, two YAML
   converters, two divergent date detectors, `stem_from_path` in 4 places, three
   `[[`-scanners, copy-pasted `contains`, `register_embeds`/`register_links`.
   When the same logic lives in two places it *diverges* (`metadata.rs` vs
   `frontmatter.rs` frontmatter-fence detection already disagree).
4. **Allocations & hot-path waste.** The high-value targets (per the
   2026 performance work: "a cheap-looking line inside a loop" is usually the
   bug):
   - `asset_index.rs:322-354` — `.to_lowercase()` allocates on **every asset** in
     passes 1 and 2, then pass 3 (correctly) uses `eq_ignore_ascii_case`.
   - `arena.rs:49-50` — `s.to_string()` twice, two heap allocations.
   - `engine.rs:208` `group_rows` — O(N·G) linear scan → O(N²) at high cardinality.
   - `snippets.rs` — O(n²) byte→char via linear `.position()`.
   - `reorder_tree` — fresh `Vec`s every frame.

---

## 2. Rust practices we will adopt (grounded, 2026)

This is the playbook. Each item is a *boring, standard* Rust idiom — we are
catching up to conventions, not being clever. (Source lines reference our own
code; the guidance behind them is the consolidated community/NLP survey in
Section 5.)

### 2.1 File/module structure (& SOLID-S)

- **Split the four god modules** into `foo.rs` + `foo/mod.rs` (modern
  file-per-module layout preferred; `mod.rs` only where a sibling list reads
  better). Budgets: file ≤ ~450 loc soft / 500+ smell; function ≤ ~40 loc;
  an `impl` block holds **one** concern. Split when: nesting deepens, control
  flow is hard to scan, a function both decides policy and performs mechanics.
- **`lib.rs` is small and intentional** — `pub mod` + `pub use` re-exports only;
  internals stay private or `pub(crate)`.
- **`pub(crate)` over bare `pub`** for internal helpers (shrinks the public
  surface; the compiler enforces it).

### 2.2 Error handling

- Every library crate gets a `#[derive(thiserror::Error)]` enum with
  `#[error("...")]` Display messages and `#[from]`/`#[source]` for wrapped
  sources. Variants exist per **caller-branch**, not per message.
- `anyhow` only at the app boundary (`apps/tauri`). `map_err` low→high at layer
  transitions so internal `io`/`serde` errors never leak.
- Replace silent degradation in library code:
  - `asset_index`/`indexer` `.unwrap_or_default()` on a read error → return a
    typed error or `tracing::warn!`.
  - `cache.rs VaultCache::load()` returning `Option` for *every* failure mode →
    `Result<Option<Self>, VaultCacheError>`.
  - `let _ = flush_pending()` → propagate or `tracing::warn!`.
- Panics are a bug or a provable invariant. `expect("...")` with the reason,
  never bare `unwrap()`, and never on user-controllable state
  (`engine.rs:188` `members.first().expect(...)`).
- Add `#[must_use]` on public fallible/`Result`/`Option` returns and key value
  types.

### 2.3 Newtypes and the type system

- `type NodeId = u32` (`arena.rs:4`) → a real `pub struct NodeId(u32)` with
  `Copy`, `PartialEq`, `Hash`. A bare alias defeats the abstraction (any `u32`
  is accepted where `NodeId` is expected); a newtype is **zero-cost** — same
  layout, `Eq`/`Hash` mappings are trivially derived.
- `FieldRef(pub Vec<String>)` → a named struct `FieldPath { segments }` (or keep
  tuple but add a validated `new`) so empty segments are unrepresentable.
- `QueryColumn.type_` as a `String` → a closed serialized **enum**
  (`Text|Number|Date|Checkbox|Link|List`), so typos can't produce invalid output.
- Keep enums that grow `#[non_exhaustive]`; the compiler then forces a `_` arm
  in downstream `match`es instead of a silent forward-compat bug.
- Borrow-by-default API design: take `&str`/`&[T]`, return `&str`/`Cow<'_,str>`
  where ownership isn't required, `impl IntoIterator`/`AsRef` where flexibility
  helps. Reserve `String` for long-lived storage.

### 2.4 Macros — judicious, not clever

Per Effective Rust Item 28 + Microsoft's Rust Guidelines: **macros are a last
resort**, best for *syntax* a function can't produce (a clean `HashMap` literal,
implementing the same trait across many types). Rules we adopt:

- Prefer **function/generic first**, then `macro_rules!`, then (rarely) proc.
- Prefer `macro_rules!` over custom proc macros — no `syn`/`quote`/build-time
  cost, works in the crate, inlines with `$crate`.
- Keep expansions small and Rust-shaped; avoid nonlocal control flow and
  repeated-expansion side effects.
- Candidate uses in our tree (if any do *not* reduce to a function, we skip them):
  enum↔string/strum derives that stay in sync with the data type, and any
  copy-pasted match that must never drift.

### 2.5 Performance

Guiding quote (from the 2026 profiling work): *profile the process, not your
model of it*; the expensive line rarely looks expensive — it's a `format!`, a
`to_string()`, a `.clone()` **inside the loop**.

- Reuse/pre-size collections: `with_capacity`, `.clear()` reuse, avoid
  per-frame `Vec` rebuilds in `reorder_tree` (make buffers scratch fields).
- Zero-copy / borrow in hot paths: `&str` returns, `Cow`, `eq_ignore_ascii_case`
  instead of `to_lowercase()`, single `to_string()` in `arena::get_or_insert`.
- Algorithmic fixes before micro-opts: `group_rows` HashMap-indexed grouper
  (O(N·G)→O(N)), `partition_point` for the snippets byte→char map (O(n²)→O(log n)).
- **Measure, don't guess.** Every Phase-4 change is gated on the Criterion
  benches at both 5k and 25k fixtures, plus a `cargo flamegraph`/`samply` pass
  to confirm the target is actually hot.
- Keep telemetry off the hot path; don't format strings on the success path.

### 2.6 Lint / tooling hygiene

- Commit a `clippy.toml` (workspace root): `cognitive-complexity-threshold`,
  `too-many-arguments-threshold`, `type-complexity-threshold`.
- CI already runs `bun run lint:rust`. Tighten to `-D warnings` for the two
  lints that catch our exact failure modes: `clippy::perf` (unnecessary
  allocs/clones) and `clippy::pedantic`-subset (cognitive complexity). Do **not**
  blanket-enable all of pedantic — select deliberately.
- `cargo fmt --all` on every commit; add a formatting gate.

---

## 3. What is actually wrong, by crate (with file:line)

See the four deep reviews that produced this plan. Highlights:

| Crate | Highest-impact findings |
|---|---|
| `basalt-parser` | `query.rs` god module (AST+parsers+tests); hand-rolled `source_not/and/or` reimplementing nom incl. dead `_offset`; `unwrap_or(0)` swallows bad LIMIT; `PartialEq` on `f64`; missing `FromStr`/`Display`; duplicated frontmatter-fence + line-find + text-consolidation + 3× wikilink scanners; `metadata.rs` single 223-loc function; only query.rs returns `Result`. |
| `basalt-vault` | `asset_index.rs` god module; `register_embeds`/`register_links` identical-except-field; `resolve_asset` `.to_lowercase()` per asset; `.clone()` to re-index; `broken_embed_count` always 0 (dead field); `infer_mime_type` allocates `&'static` could be; `cache.rs load()` collapses all failures to `None`; `indexer` silent `.unwrap_or_default()`; `as u32` truncation; unused `_base_path`; `md5` crate outdated. |
| `basalt-graph` | `graph_layout.rs` god module (params+layout+quadtree+simulator); double `to_string()` in arena; per-frame allocs in `reorder_tree`; `NodeId` bare alias; dead `let _ = (&bx, &by)`; magic constants ungrouped; `LayoutGraph::new` pointless 5-field ctor. |
| `basalt-search` | `anyhow` everywhere (no typed errors); `AhoCorasick` rebuilt per doc; O(n²) snippets byte→char; `build_schema` returns opaque 5-tuple; `TantivyIndex::new` 7-arg; `let _ = flush_pending()`; schema-mismatch silently wipes index; `stem_from_path` duplicated across crates. |
| `basalt-tables` | `execute_query` returns `ParseError` (can't express runtime errors) → needs `DqlError`; real `expect` panic `engine.rs:188`; non-deterministic un-SORTed output (HashMap order); O(N·G) `group_rows`; copy-pasted `contains` + result-building; `type_` as `String`; `compare_typed` cross-type returns `Equal` (untruth). |
| `basalt-wasm` | No error channel (`0`/`null` sentinels); `graph_build` trusts caller pointer + clamps vs *last* buffer (UB class); two subcrates solve alloc/parse two different ways, neither fully sound; missing `# Safety` docs; `GraphState.edges` mirrors `ForceGraph::edges()`; duplicated `[profile.release]`+`[workspace]`. |
| `basalt-types` | **Two parallel typed-value systems** `TypedValue` vs `FrontmatterValue` with two divergent YAML converters + two date detectors (the #1 DRY violation); `FrontmatterValue::None => PropertyType::Text` lie; `Document`/`FileMetadata` overlap; `new()` = `Default`. |

### 3.1 The single highest-ROI change (value-type unification)

`basalt-types::TypedValue` (internally-tagged serde: `{"type":"text","value":...}`)
and `basalt-types::FrontmatterValue` (externally-tagged camelCase: `{"Text":"..."}`)
model the identical domain concept with two incompatible JSON shapes and two
divergent YAML converters (`query.rs:49` `yaml_to_typed` vs
`parser/frontmatter.rs:220` `yaml_to_value`) and two date detectors.

**Decision:** collapse them into **one** enum in `basalt-types`, keeping the
**internally-tagged** form. Critical finding that de-risks this:

- The frontend DQL consumer `apps/tauri/src/features/editor/types/query.ts`
  **already** uses the internally-tagged shape (`{ type: "text"; value }`).
  So `TypedValue` needs **zero TS changes**.
- The `FrontmatterValue` consumer is `packages/editor/src/types.ts:21-29` +
  `frontmatter-widget.ts`/`block-widgets/frontmatter.ts`, which must be updated
  to the unified shape in the same effort.

This also lets `page_row.rs` build rows from the typed model directly instead of
re-converting YAML, deletes the parser's parallel `yaml_to_value`, unifies date
detection, and removes the duplicated `contains`.

---

## 4. Execution plan (phased, each independently shippable + verified)

**Verification invariant (every phase):** `cargo test --workspace`,
`cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --check`,
then `bunx tsc --noEmit` + `bun run lint` when the TS mirrors change; run the
25k Criterion benches for any perf-claiming change.

### Phase 0 — Baseline safety (mechanics unchanged)
- `basalt-tables`: introduce `DqlError` (`thiserror`, `#[from] ParseError`);
  `execute_query -> Result<QueryResult, DqlError>`. Replace the `expect` at
  `engine.rs:188` with a `TypedValue::Null` fallback.
- `basalt-graph`: delete dead `let _ = (&bx, &by);`; `cargo fmt` (fix
  `graph.rs:154` indent).
- `basalt-vault`: remove always-zero `broken_embed_count`; fix
  `FrontmatterValue::None => PropertyType::Text`.
- `basalt-wasm`: make `graph_build` derive its slice from the owned `EDGE_BUF`
  via an offset param (removes the UB class).

### Phase 1 — Module decomposition (attack S / DRY, pure moves)

The mechanical pattern for **every** file ≥500 loc:
1. Split the file into `name/{mod,pieces}.rs`.
2. `name/mod.rs` owns the entry point + `pub use` re-exports.
3. `lib.rs` re-exports **unchanged** → no downstream edits; tests prove it.
4. Run `cargo test --workspace` + `clippy -D warnings` + `cargo fmt`.

**Target module trees (before → after):**

`basalt-parser/src/query.rs` (834 loc) →
```
query/
  mod.rs      ← module root: parse_query + ParseError entry, re-exports
  ast.rs      ← QueryType, FieldRef, SortDirection, QueryField, DataCommand,
                Literal, Expr, CompareOp, SourceFilter, QueryPlan   (~124 loc)
  parse.rs    ← all nom parsers + parse_query                       (~354 loc)
  tests.rs    ← the 356-line #[cfg(test)] block
```
`lib.rs` re-export of `parse_query`/`ParseError` unchanged.

`basalt-vault/src/asset_index.rs` (614 loc) →
```
asset_index/
  mod.rs       ← AssetIndex struct + methods (the map wrapper)
  file_type.rs ← FileType + infer_file_type + infer_mime_type   (was 10–87)
  info.rs      ← AssetInfo + AssetAuditReport                    (was 103–145)
  hash.rs      ← compute_md5                                      (was 93–97)
  tests.rs     ← 232-line test block
```
`lib.rs` re-export of `{AssetAuditReport, AssetInfo, AssetIndex, FileType}` unchanged.

`basalt-graph/src/graph_layout.rs` (685 loc) →
```
graph_layout/
  mod.rs         ← module root re-export
  params.rs      ← GraphParams (+ builder)                     (was 24–62)
  layout_graph.rs← LayoutGraph conversion                      (was 64–136)
  force_graph.rs ← Quad + ForceGraph simulator + constants     (was 138–592)
  tests.rs       ← ~90-line test block
```
`lib.rs` re-export of `{ForceGraph, LayoutGraph, GraphParams}` unchanged.

`basalt-search/src/tantivy/schema.rs` (32 loc) — stays one file; fix is the
opaque **5-tuple return** → a named `SchemaFields` struct.

#### 1.1 Execution guide — exact boundaries (verified against source)

Do the split manually with these line anchors; they match the current files.

**`basalt-parser/src/query.rs` (834 loc)**
- Items in the file: `QueryType`(14), `ParseError`(22), `FieldRef`(33),
  `SortDirection`(37), `QueryField`(44), `DataCommand`(51), `Literal`(70),
  `Expr`(79), `CompareOp`(96), `SourceFilter`(108), `QueryPlan`(119) —
  **these 11 AST types → `ast.rs`** (plus the `is_iso_date_string`/date helper
  if present in that block).
- `const DQL_KEYWORDS`(130), `is_keyword`/`is_ident_char`(136/141), and all
  `fn *_parser` from `field_ref`(146) → `query_plan`(438), plus
  `pub fn parse_query`(471) — **nom parsers + entry → `parse.rs`**.
- `#[cfg(test)] mod tests {`(480) → **`tests.rs`** (a `mod tests;` in
  `mod.rs`, or `#[path]` if preferred).
- `query/mod.rs` declares `mod ast; mod parse; mod tests;` and
  `pub use ast::*; pub use parse::parse_query;` (re-exports `ParseError` from
  `ast`). Keep `lib.rs`'s `pub mod query; pub use query::{parse_query, ParseError};`
  **unchanged**.

**`basalt-vault/src/asset_index.rs` (614 loc)** — anchors from the review:
- `FileType` enum + `infer_file_type()` + `infer_mime_type()` (10–87) → `file_type.rs`.
- `compute_md5()` (93–97) → `hash.rs` (or `utils.rs`).
- `AssetInfo` + `AssetAuditReport` (103–145) → `info.rs`.
- `pub struct AssetIndex` (158) + all methods to end → `mod.rs`.
- `#[cfg(test)] mod tests {` (383) → `tests.rs`.
- `mod.rs` re-exports `{FileType, AssetInfo, AssetAuditReport, AssetIndex}` so
  `lib.rs`'s existing `pub use asset_index::{...}` stays untouched.

**`basalt-graph/src/graph_layout.rs` (685 loc)** — anchors from the review:
- `GraphParams` + `Default` (24–62) → `params.rs`.
- `LayoutGraph` + `from_note_graph` (64–136) → `layout_graph.rs`.
- `Quad` + quadtree constants (`EMPTY`/`MAX_DEPTH`/`UNPLACED`) (138–162) +
  `ForceGraph` + force constants (`ALPHA_DECAY`/`ALPHA_MIN`) (164–592) → `force_graph.rs`.
- `#[cfg(test)]` (594) → `tests.rs`.
- `mod.rs` re-exports `{GraphParams, LayoutGraph, ForceGraph}`; `lib.rs`
  `pub use graph_layout::{ForceGraph, LayoutGraph, GraphParams};` unchanged.

**Function-level decomposition (not file-level):**
- `basalt-tables/src/engine.rs` — split `execute_query` into per-`QueryType`
  handlers + a `link_row()` helper.
- `basalt-parser/src/metadata.rs` — decompose the 223-loc `extract_metadata`
  into `extract_frontmatter` + `extract_body_tokens`.
- `basalt-wasm` — unify the two alloc/parse patterns; fix `graph_build` raw-pointer trust.

### Phase 2 — Value-type unification (biggest ROI)
- Collapse `TypedValue` + `FrontmatterValue` into one internally-tagged enum;
  single YAML converter; single date classifier; all in `basalt-types`.
- Delete `parser/frontmatter.rs` `yaml_to_value`; route through the shared one.
- Update TS mirrors: `packages/editor/src/types.ts`:21-29 + `frontmatter-widget.ts`/
  `block-widgets/frontmatter.ts`. `features/editor/types/query.ts` unchanged.

### Phase 3 — Error handling + idiomatic types (attack I / D)
- `VaultError` + `SearchError` (`thiserror`); fix each silent-failure site from
  Section 3 (cache load, indexer read, flush, schema-wipe → log).
- `NodeId` newtype; `FieldPath`; `QueryColumn.type_` enum; `#[non_exhaustive]` on
  shared AST enums; `Display`/`FromStr` (`QueryPlan`, `CompareOp`, `FileType`);
  `#[must_use]` pass; `Display` for `Expr` (replaces `expr_text`).
- `compare_typed`/`is_truthy` move onto `TypedValue` in `basalt-types`.

### Phase 4 — Performance + determinism
- `group_rows` HashMap grouper; deterministic default sort (by path) for
  un-SORTed DQL; `resolve_asset` `eq_ignore_ascii_case`; single `to_string` in
  arena; scratch buffers in `reorder_tree`; `partition_point` in snippets;
  hoist `AhoCorasick`; `infer_mime_type` → `&'static str`.
- Gate each on Criterion at 5k **and 25k**.

### Phase 5 — Hygiene / conventions
- Single serde convention per crate; unify benchmark fixtures
  (`benches/common.rs`); fix README `FileSystem` claim; add `clippy.toml` +
  lint gates (`perf`, selected `pedantic`); update `AGENTS.md` + `CURRENT_WORK.md`.

---

## 5. Research sources consulted

Consolidated, not cited-inline, to keep the doc readable. Full search summaries
available on request.

- **Error handling:** thiserror/anyhow 2026 guides (SharpSkill, KruN, Andrew
  Odendaal, lucaberton, School of Web, oneuptime) — unanimous on
  *libraries=thiserror, applications=anyhow, `#[from]`/`#[source]`, never
  `Result<_, String>`, `#[non_exhaustive]`, `#[must_use]`*. Rust API guidelines.
- **Macros:** Microsoft Pragmatic Rust Guidelines (M-MACRO-LAST-RESORT,
  M-EXAMPLE-OVER-PROC, M-MACROS-DONT-LIE); Effective Rust Item 28; Rust
  Project Goals macro-improvements 2026.
- **Performance:** Microsoft Pragmatic Rust Performance guidelines
  (M-MEM-REUSE, M-HOTPATH, M-AVOID-INDIRECTION); MARVIN-Wall/Rust-Patterns
  allocation + zero-cost chapters; Multiple 2026 "hunting allocations / borrowed
  strings" case studies (profiling-first lesson, format!/to_string-in-loop).
- **Structure/hygiene:** rustfaq maintainability guide; clippy lint-config +
  `clippy.toml` thresholds; module/crate-best-practice posts (One Horizon 2026,
  Software Patterns Lexicon, Anuragh) — modern `foo.rs`+`foo/` layout, thin
  `lib.rs`, `pub(crate)`, file/function budgets.

---

## 6. Decisions locked

- **Scope:** all phases 0–5, end-to-end.
- **Value unification serde shape:** internally-tagged form (matches existing
  frontend `query.ts`); update the `packages/editor` `FrontmatterValue` mirrors
  in the same effort.
- **This is a plan.** No code changed by this ADR. Execution proceeds phase by
  phase, each gated on the verification invariant.