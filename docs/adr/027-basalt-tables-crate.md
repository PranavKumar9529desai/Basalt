# ADR-027: `basalt-tables` Crate — Query Execution and Event Tables

**Date:** 2026-09-01  
**Status:** Accepted

## Context

The DQL query execution engine currently lives in `apps/tauri/src-tauri/src/commands/query.rs`, mixed with Tauri command boilerplate. This violates separation of concerns:

1. **Testability** — Execution logic cannot be unit-tested without bootstrapping a Tauri app state
2. **Reusability** — The engine cannot be reused from WASM or other non-Tauri contexts
3. **Consistency** — Every other domain (graph, search, parser) has its own crate; queries are a distinct domain
4. **Future scope** — Event-table reactivity (pushing updates when notes change) belongs in a dedicated crate, not in a Tauri command handler

The precedent is `basalt-graph`: originally part of `basalt-vault`, it was extracted into its own crate when the graph domain grew beyond vault concerns. Query execution is at the same inflection point.

## Decision

Create **`crates/basalt-tables/`** — a new Rust crate owning:

| Concern | Current location | Destination |
|---------|-----------------|-------------|
| DQL query execution (filter, sort, limit, group) | `commands/query.rs` | `basalt-tables::engine` |
| `PageRow` construction from vault metadata | `commands/query.rs` | `basalt-tables::engine` |
| Expression evaluation (`eval_expr`, `eval_to_typed`) | `commands/query.rs` | `basalt-tables::engine` |
| Column/row building (`build_columns`, `resolve_column`) | `commands/query.rs` | `basalt-tables::engine` |
| Event-table streams (future) | — | `basalt-tables::events` |

The Tauri command `run_query` becomes a thin wrapper: parse DQL → call `basalt-tables::execute_query` → return result.

### Dependency direction

```
basalt-types → basalt-parser → basalt-tables → (reads) → basalt-vault
                                                       → basalt-graph
```

`basalt-tables` depends on `basalt-vault` and `basalt-graph` (to read vault data).  
`basalt-vault` does **not** depend on `basalt-tables` (no cycles).

### Crate structure

```
crates/basalt-tables/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs              # Public API: execute_query()
│   ├── engine.rs           # Core execution: filter, sort, limit, group
│   ├── expr.rs             # Expression evaluation
│   ├── page_row.rs         # PageRow construction from vault metadata
│   └── events.rs           # (Future) Event-table reactivity
├── benches/
│   └── query_execution.rs  # Criterion benchmarks at 1k/5k/25k scale
└── tests/
    └── integration.rs      # End-to-end DQL → QueryResult tests
```

## Rationale

- **Single responsibility** — `basalt-tables` owns query execution; `basalt-vault` owns vault/filesystem; `basalt-parser` owns DQL parsing
- **Testability** — Unit tests create a small `Vault`, insert documents, run queries, assert results — no Tauri required
- **Reusability** — WASM builds can import `basalt-tables` directly for client-side query execution
- **Consistency** — Follows the established pattern: one domain → one crate (graph, search, parser)
- **Performance** — Criterion benchmarks at 25k scale stay consistent with the performance-first ethos (ADR-017)

## Consequences

### Immediate

- `apps/tauri/src-tauri/Cargo.toml` gains `basalt-tables` dependency
- `commands/query.rs` shrinks to ~20 lines: parse → call `execute_query` → return
- All execution logic moves to `crates/basalt-tables/src/engine.rs`
- `PageRow`, `eval_expr`, `build_columns` etc. become `pub(crate)` in `basalt-tables`

### Testing

- Add `cargo test -p basalt-tables` to CI
- Add `cargo bench -p basalt-tables` with 1k/5k/25k note fixtures
- Existing `run_query` Tauri command remains functional (thin wrapper)

### Future

- Event-table reactivity (push updates on note change) lands in `basalt-tables::events`
- WASM builds can expose `execute_query` for client-side DQL without IPC
- Query execution benchmarks run independently of Tauri startup cost

## Migration Steps

1. **Scaffold** — `cargo new crates/basalt-tables --lib`, add to workspace `Cargo.toml`
2. **Dependencies** — `basalt-types`, `basalt-parser`, `basalt-vault`, `basalt-graph`
3. **Move logic** — Copy `engine.rs`, `expr.rs`, `page_row.rs` from `commands/query.rs`
4. **Public API** — `pub fn execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, String>`
5. **Thin wrapper** — Rewrite `commands/query.rs` to call `basalt_tables::execute_query`
6. **Tests** — Add unit tests for each execution path (FROM, WHERE, SORT, LIMIT, GROUP)
7. **Benchmarks** — Add Criterion suite at 1k/5k/25k scale
8. **Docs** — Update `crates/README.md` (if exists), add `basalt-tables/README.md`

## References

- ADR-009: Rust Crate Restructure (single-responsibility precedent)
- ADR-017: Benchmark Infrastructure (performance measurement)
- ADR-008: Native Search Architecture (similar extraction pattern)
- Current implementation: `apps/tauri/src-tauri/src/commands/query.rs`