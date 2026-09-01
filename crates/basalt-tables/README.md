# basalt-tables — Query Execution & Event Tables

Executes Dataview-style **DQL queries** against the vault's indexed metadata,
plus (future) event-table reactivity. This is the query execution half of the
DQL story; the grammar/parsing lives in `basalt-parser`, and the data lives in
`basalt-vault`.

Depends on `basalt-types`, `basalt-parser`, `basalt-vault`, and `basalt-graph`.

## Public API

- `execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, String>` — parse, plan, and execute a DQL query against a vault's metadata.

## Modules

| Module      | Provides                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `engine`    | `execute_query` — core execution (FROM / WHERE / SORT / LIMIT + TABLE/LIST/TASK result building) |
| `expr`      | `eval_expr`, `eval_to_typed`, `field_value`, `compare_typed` — expression evaluation and typed comparison |
| `page_row`  | `PageRow` + `build_page_rows`, `matches_source` — row construction from vault metadata and FROM filtering |

## Documentation

- ADR-027: [`basalt-tables` Crate — Query Execution and Event Tables](../../docs/adr/027-basalt-tables-crate.md)
