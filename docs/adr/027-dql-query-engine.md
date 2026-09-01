# ADR-027: DQL Query Engine — basalt-tables Crate

## Status

Accepted (2026-09-02)

## Context

The DQL (Dataview Query Language) query engine is the backbone of structured
data views — TABLE, LIST, and TASK queries that filter, sort, and present
note metadata. The initial implementation lived as a single290-line
`query.rs` command handler, mixing parsing, expression evaluation, and
output formatting in one monolith. This made the engine impossible to
benchmark in isolation, test without a Tauri runtime, or reuse outside the
app.

The goal: extract a standalone Rust crate (`basalt-tables`) that executes
DQL queries against any `Vault`-compatible data source, with clean
separation from the parser (`basalt-parser`), types (`basalt-types`), and
vault data (`basalt-vault`).

## Decision

### Crate structure

```
crates/basalt-parser/src/query.rs   — nom-based recursive descent parser
crates/basalt-types/src/query.rs    — TypedValue, QueryResult, yaml_to_typed
crates/basalt-tables/src/engine.rs  — execute_query orchestrator
crates/basalt-tables/src/expr.rs    — expression evaluator
crates/basalt-tables/src/page_row.rs — PageRow builder + FROM filter
```

Data flow:

```
DQL string → parse_query() → QueryPlan
                              ↓
Vault metadata → build_page_rows() → Vec<PageRow>
                              ↓
FROM filter → WHERE filter → SORT → LIMIT → build QueryResult
```

### Tauri command thin wrapper

`apps/tauri/src-tauri/src/commands/query.rs` is a7-line wrapper:

```rust
pub fn run_query(dql: String, _path: String, state: State<AppState>)
  -> Result<QueryResult, String> {
    let vault = state.vault.read()?;
    basalt_tables::execute_query(&vault, &dql)
}
```

### Parser: FROM boolean combinators (ADR-027 amendment, 2026-09-02)

The parser supports boolean FROM with standard precedence:

```
source_or     = source_and (OR source_and)*
source_and    = source_not (AND source_not)*
source_not    = NOT source_not | source_primary
source_primary = source_tag | source_folder | source_link | source_group
source_group  = "(" source_or ")"
```

Precedence: NOT > AND > OR. Parenthesized groups supported.
Implementation uses manual trim + keyword check (not nom `tag_no_case`)
to avoid ambiguity with identifiers that share keyword prefixes.

### Expression evaluator

`eval_expr` returns `bool` (row matches or not). Currently supports:
- Field references, literals, comparison operators (`=`, `!=`, `<`, `>`, `<=`, `>=`)
- `contains(field, substring)` function
- Unknown functions return `false` (no match) — safety over silent
  full-match (was `true` before the fix)

### Frontmatter sequence handling

`yaml_to_typed` for `Value::Sequence` joins all string elements as
comma-separated text (`"work, urgent"`) instead of silently dropping all
but the first element. Single-element sequences return the element
directly. Empty sequences return `TypedValue::Null`.

### PageRow

Built from `graph.metadata_cache` (O(n) per query). Each row carries:
- `path`, `name`, `folder` — derived from string arena
- `tags`, `links` — from `NoteMetadata`
- `frontmatter: Vec<(String, TypedValue)>` — from YAML frontmatter via
  `yaml_to_typed_pairs`

`matches_source` handles `SourceFilter::Tag/Folder/Link/And/Or/Not` —
no `_graph` parameter (removed as dead code).

## Consequences

### Achieved
- Parser and engine are independently testable (62 parser tests, 5 engine
  tests, 20-query example runner)
- Clean crate separation: parser/types/executor/data — no cycles
- Tauri wrapper is7 lines; all logic lives in crates
- Boolean FROM (AND/OR/NOT/parenthesized) works end-to-end
- Array frontmatter no longer silently truncated
- Unknown WHERE functions don't silently match everything

### Known limitations (in scope for ADR-028)
- No GROUP BY / FLATTEN (enum variants exist but parser/engine don't use them)
- No aggregation functions (count, sum, avg, min, max)
- TASK query is a stub (no checkbox extraction from body)
- No inline `key:: value` fields (frontmatter only)
- Date comparison falls through to `Ordering::Equal` in `compare_typed`
- Column type inference is based on first non-null row only

### Performance
- Every query re-scans `graph.metadata_cache` — acceptable at current
  scale, but a query index (ADR-028 scope) is needed for repeated/reactive
  queries at 25k+ notes
- `field_value` does linear scan over frontmatter `Vec` per row —
  `HashMap` in `PageRow` would make this O(1)
