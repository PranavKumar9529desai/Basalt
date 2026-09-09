# ADR-027: DQL Query Engine — basalt-tables Crate

## Status

Accepted (2026-09-02) — implemented

## Context

The DQL (Dataview Query Language) query engine is the backbone of structured
data views — TABLE, LIST, and TASK queries that filter, sort, aggregate, and
present note metadata. The engine is a standalone Rust crate (`basalt-tables`)
that executes DQL queries against any `Vault`-compatible data source, with
clean separation from the parser (`basalt-parser`), shared types
(`basalt-types`), and vault data (`basalt-vault`).

## Decision

### Crate structure

```
crates/basalt-parser/src/query/    — parser (mod.rs, ast.rs, parse.rs, tests.rs)
    ├── ast.rs                     — DataCommand, QueryPlan, Expr, FieldRef, SourceFilter, QueryType
    └── parse.rs                   — manual recursive descent (nom-free)
crates/basalt-types/src/query.rs   — TypedValue, QueryColumnType, QueryResult,
                                     yaml_to_typed / yaml_to_typed_pairs
crates/basalt-tables/src/
    ├── lib.rs                     — execute_query() entry point
    ├── engine.rs                  — command-walk orchestrator, GROUP BY / FLATTEN / SORT / TASK
    ├── expr.rs                    — eval_expr (WHERE), eval_to_typed (columns/SORT), aggregates, compare_typed
    └── page_row.rs                — PageRow builder + FROM filter (build_page_rows / matches_source)
```

Data flow:

```
DQL string → parse_query() → QueryPlan (commands walked in written order)
              ↓
Vault metadata → build_page_rows() → Vec<PageRow>
              ↓
FROM → WHERE → FLATTEN → [GROUP BY → aggregates] → SORT → LIMIT → QueryResult
```

### Tauri command thin wrapper

`apps/tauri/src-tauri/src/commands/query.rs` is a 19-line wrapper that maps
engine errors into the typed `AppError` variant:

```rust
#[tauri::command]
pub fn run_query(
    dql: String,
    _path: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    let vault = state.vault.read()?;
    basalt_tables::execute_query(&vault, &dql).map_err(|e| AppError::Query(e.to_string()))
}
```

### Parser: boolean FROM + command walk

The parser supports boolean FROM with standard precedence: `NOT` > `AND` >
`OR`, with parenthesized groups:

```
source_or     = source_and (OR source_and)*
source_and    = source_not (AND source_not)*
source_not    = NOT source_not | source_primary
source_primary = source_tag | source_folder | source_link | source_group
source_group  = "(" source_or ")"
```

`parse_query` walks commands in **written order** (Dataview semantics)
`LIMIT 5 SORT date ASC` is legal, duplicates are allowed, and `GROUP BY` may
sit anywhere in the chain. `GROUP BY` transforms rows into groups immediately;
subsequent WHERE/SORT/LIMIT operate on groups.

### Expression evaluator

Two evaluation entry points in `expr.rs`:

- `eval_expr(expr, ctx)` → `bool` — WHERE predicates.
- `eval_to_typed(expr, ctx)` → `TypedValue` — column output, SORT keys, and
  aggregate arguments.

Supported surface: field references, literals, comparisons (`=`, `!=`, `<`,
`>`, `<=`, `>=`), `NOT`, `contains(haystack, needle)` (substring or list
membership), `length(x)` (list length, text char count, number passthrough),
and the aggregate library from ADR-028 (`count`, `length`, `sum`, `avg`,
`average`, `min`, `max`) which only evaluate inside a GROUP BY context.
Unknown functions are `Null` in a column context and no-match in WHERE —
never a silent full-match.

### `TypedValue` / metadata types

`basalt-types/src/query.rs`:

- `TypedValue` — internally tagged (ADR-030): `Text`, `Number`, `Checkbox`,
  `Date`, `DateTime`, `Link { name, path }`, `List { items }`, `Null`.
- `QueryColumnType` — the type hint per column (`Text`, `Number`,
  `Checkbox`, `Link`, `Date`, `List`).
- `QueryResult { columns, rows, total }`.
- `yaml_to_typed` / `yaml_to_typed_pairs` — YAML → `TypedValue` conversion.
  A YAML `Sequence` becomes `TypedValue::List { items }` preserving every
  element (including single-element and empty sequences).

### PageRow

Built by `build_page_rows(&StringArena, &NoteGraph)` iterating
`graph.metadata_cache` (O(n) per query). Each row carries `path`, `name`,
`folder`, `tags`, `links`, and `frontmatter: Vec<(String, TypedValue)>`.

`matches_source` handles `SourceFilter::Tag/Folder/Link/And/Or/Not`.

### Aggregation (ADR-028)

GROUP BY and FLATTEN are shipped. GROUP BY groups rows by an evaluated `Expr`
key using strict `GroupKey` type-and-value equality (`Number(3)` and
`Text("3")` are distinct groups), preserving first-seen order. FLATTEN
evaluates an expression per page and injects the result as a synthetic
frontmatter entry under its alias; when the value is a `TypedValue::List`, the
row splits into one row per item (empty lists drop the row).

## Consequences

### Achieved

- Parser and engine are independent Rust crates — testable and benchmarkable
  without a Tauri runtime, and reusable outside the app.
- The thin Tauri wrapper is 19 lines; all logic lives in the crates.
- Boolean FROM (AND/OR/NOT/parenthesized) works end-to-end.
- Array frontmatter is preserved as `TypedValue::List` (no truncation).
- Unknown WHERE functions do not silently match everything.
- Date values compare lexicographically (`compare_typed`), correct for
  ISO-8601, so `SORT date`, `min`, and `max` over dates work.
- ORDER-Sensitive command walk matches Dataview semantics.

### Known limitations

- Every query re-scans `graph.metadata_cache` — acceptable at current scale;
  a query index is the open follow-up for repeated/reactive queries at 25k+
  notes.
- `field_value` does a linear scan over the frontmatter `Vec` per row — a
  `HashMap<String, TypedValue>` in `PageRow` would make repeated field access
  O(1).
- Nested GROUP BY (grouping already-grouped rows) is deferred; grouped rows
  pass through unchanged.
- TASK query groups by status only at its current extent; body checkbox
  extraction is the natural extension.
- The vanilla column type inference is based on the first non-null row only.

## Performance

- Criterion benches cover the engine at the 25k-notes tier (ADR-017/AGENTS.md
  rule).
- Documented perf notes: metadata-cache rescan per query and linear frontmatter
  `Vec` lookups are the recorded hot spots to revisit when queries become
  reactive.
