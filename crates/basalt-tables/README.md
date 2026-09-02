# basalt-tables — Query Execution & Event Tables

Executes Dataview-style **DQL queries** against the vault's indexed metadata,
plus (future) event-table reactivity. Grammar/parsing lives in `basalt-parser`,
data lives in `basalt-vault`.

Depends on `basalt-types`, `basalt-parser`, `basalt-vault`, `basalt-graph`.

## Public API

- `execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, String>`

## Modules

| Module      | Provides                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `engine`    | `execute_query` — FROM / WHERE / SORT / LIMIT / GROUP BY / FLATTEN + TABLE/LIST/TASK |
| `expr`      | `eval_expr`, `eval_to_typed`, `field_value`, `eval_aggregate`, `compare_typed`      |
| `page_row`  | `PageRow`, `build_page_rows`, `matches_source`                                      |

## Documentation
- ADR-027: [`basalt-tables` Crate — Query Execution and Event Tables](../../docs/adr/027-basalt-tables-crate.md)
- ADR-028: [DQL Aggregation — GROUP BY, FLATTEN, Aggregate Functions](../../docs/adr/028-dql-aggregation.md)

## Supported Features

| Command / Feature | Description |
|---|---|
| `GROUP BY <field>` | Group rows by a field value; aggregate functions operate over the group's `rows` |
| `FLATTEN <expr> AS <name>` | Evaluate an expression per row, injecting the result as a synthetic field |
| `count(rows)` / `length(rows)` | Number of rows in the current group |
| `count(field)` / `length(field)` | Non-null count of a field across group members |
| `sum(rows.field)` | Sum of a numeric field across group members |
| `avg(rows.field)` / `average(rows.field)` | Arithmetic mean of a numeric field |
| `min(rows.field)` / `max(rows.field)` | Extremum of a numeric field |
| `WHERE bare_field` | Tests truthiness (Checkbox true, non-null) |
| Date detection | `YYYY-MM-DD` and `YYYY-MM-DDTHH:...` strings convert to `TypedValue::Date` |

## Running Benchmarks

```sh
cargo bench --bench query_execution -p basalt-tables
```
