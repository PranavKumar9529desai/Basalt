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
| `engine`    | `execute_query` — FROM / WHERE / SORT / LIMIT + TABLE/LIST/TASK building |
| `expr`      | `eval_expr`, `eval_to_typed`, `field_value`, `compare_typed`             |
| `page_row`  | `PageRow`, `build_page_rows`, `matches_source`                           |

## Documentation

- ADR-027: [`basalt-tables` Crate — Query Execution and Event Tables](../../docs/adr/027-basalt-tables-crate.md)