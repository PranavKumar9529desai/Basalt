# ADR-028: DQL Aggregation — GROUP BY, FLATTEN, Aggregate Functions

## Status

Proposed (2026-09-02)

## Context

The DQL engine (ADR-027) handles TABLE/LIST/TASK queries with FROM, WHERE,
SORT, and LIMIT. It is missing the aggregation features that make Dataview
powerful for structured data views:

1. **GROUP BY** — group rows by a field value, then compute per-group
   expressions. Without it, `TASK FROM #work GROUP BY status` is
   impossible (the most common Dataview query pattern).

2. **FLATTEN** — evaluate an expression and add the result as a new column
   to every row (e.g. `FLATTEN length(tags) AS tag_count`).

3. **Aggregate functions** — `count(rows)`, `sum(rows.priority)`,
   `avg(rows.rating)`, `min(rows.due)`, `max(rows.score)` — functions
   that operate over grouped sub-arrays, not individual rows.

The parser already has dead enum variants (`DataCommand::GroupBy`,
`DataCommand::Flatten`) but no parser combinator produces them and the
engine ignores them.

## Decision

### New AST nodes

```rust
// In basalt-parser/src/query.rs
enum DataCommand {
    Where(Expr),
    Sort { field: FieldRef, direction: SortDirection },
    GroupBy(FieldRef),          // changed from Expr to FieldRef (group by one field)
    Flatten(FlattenExpr),       // expression + optional alias
    Limit(u64),
    // NEW:
}

enum AggregateExpr {
    Func { name: String, arg: Box<Expr> },
    // count(rows), sum(rows.field), avg(rows.field), min(rows.field), max(rows.field)
}

struct FlattenExpr {
    expr: Expr,
    alias: Option<String>,
}
```

In the expression language, aggregate functions are a new `Expr` variant:

```rust
enum Expr {
    Field(FieldRef),
    Literal(Literal),
    Comparison { left: Box<Expr>, op: CompareOp, right: Box<Expr> },
    Not(Box<Expr>),
    Func { name: String, args: Vec<Expr> },
    // NEW: aggregate functions — only valid inside GROUP BY context
    Aggregate { name: String, arg: FieldRef },
    // The "rows" variable for aggregate arg resolution
}
```

### GROUP BY semantics

```sql
TABLE status, COUNT(rows) AS "Count"
FROM #work
GROUP BY status
```

Execution:
1. FROM → WHERE → apply pipeline to get filtered rows
2. Group rows by the GROUP BY field value (HashMap<String, Vec<PageRow>>)
3. For each group, evaluate the field list where aggregate functions
   operate over the group's `rows` sub-array
4. Non-aggregate fields in the SELECT list must be the GROUP BY field
   itself (Dataview constraint — not enforced strictly, defaults to group key)

The special variable `rows` in aggregate args refers to all `PageRow`s
in the current group. `count(rows)` = group size. `sum(rows.priority)`
sums the `priority` field across all pages in the group.

### FLATTEN semantics

```sql
TABLE file.name, tag_count
FROM #work
FLATTEN length(tags) AS tag_count
```

Execution:
1. FROM → WHERE → build PageRows
2. For each row, evaluate the FLATTEN expression and add the result as
   a new virtual field on the PageRow
3. SORT/LIMIT operate after FLATTEN (the flattened field is available
   for SORT)

FLATTEN adds a synthetic entry to `PageRow.frontmatter` under the alias
name so `field_value` can resolve it naturally.

### Aggregate function library

| Function | Signature | Description |
|---|---|---|
| `count` | `count(rows)` | Number of rows in the group |
| `sum` | `sum(rows.field)` | Sum of numeric field values |
| `avg` | `avg(rows.field)` | Arithmetic mean of numeric field values |
| `min` | `min(rows.field)` | Minimum value (supports Number, Text, Date) |
| `max` | `max(rows.field)` | Maximum value (supports Number, Text, Date) |
| `length` | `length(rows.field)` | Length of array/text field per row (existing) |

Unknown aggregate functions: return `TypedValue::Null` (graceful degrade,
not error — keeps the query-result contract intact).

### Parser priority

1. GROUP BY parser: `preceded(tag_no_case("GROUP"), preceded(multispace1, tag_no_case("BY")))` then `field_ref`
2. FLATTEN parser: `preceded(tag_no_case("FLATTEN"), preceded(multispace1, flatten_expr))`
3. Aggregate function detection in WHERE expressions: only valid when GROUP BY
   is present in the query; parser doesn't enforce this — engine validates

### Engine changes

```
execute_query:
  pages = build_page_rows()
  FROM filter
  WHERE filter
  FLATTEN (add synthetic fields to each row)
  SORT (on enriched rows)
  LIMIT

  // NEW: if GROUP BY present:
  groups = group_by(pages, group_by_field)
  for each (key, group_rows) in groups:
    evaluate field list with aggregate context { rows: group_rows }
    emit one row per group

  else:
    // existing: one row per page
```

### `TypedValue` additions

No new variants needed. Aggregates return existing types:
- `count` → `TypedValue::Number`
- `sum`/`avg` → `TypedValue::Number`
- `min`/`max` → inherits type of the compared field

## Consequences

### Achieved (when implemented)
- `TASK FROM #work GROUP BY status` shows count per status — the most
  common Dataview query pattern
- `TABLE file.name, length(tags) AS "Tags" FROM #work FLATTEN length(tags) AS "Tags"` works
- Aggregate functions in GROUP BY context enable dashboard-style views
- Parser/enum already partially prepared (`GroupBy`/`Flatten` dead variants) —
  implementation is filling in, not redesigning

### Scope
- Single-field GROUP BY only (no multi-field `GROUP BY status, assignee`)
  — covers 90% of use cases; multi-field is a future extension
- Aggregate functions only inside GROUP BY context (not standalone
  `COUNT(*)` without GROUP BY — Dataview allows this but it's a
  different execution path)
- FLATTEN is pre-GROUP BY (flattened fields available for GROUP BY key)

### Known debt to address alongside
- `compare_typed`: Date comparison falls through to `Equal` — must be
  fixed before `min(rows.due)` / `max(rows.due)` work correctly
- `field_value`: linear scan per row — acceptable for MVP, but a
  `HashMap<String, TypedValue>` in PageRow would make FLATTEN
  additions and repeated field access O(1)
- Unknown functions in WHERE currently return `false` (safe default) —
  extend with `length()`, `regexmatch()`, `date()` in a follow-up
