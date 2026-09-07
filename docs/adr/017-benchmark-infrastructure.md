# ADR-017: Benchmark Infrastructure — Criterion for Performance Measurement

**Status:** Accepted (implementation complete)
**Date:** 2026-07-12

## Context

Basalt aims to beat Obsidian's performance (<800ms TTI, <150ms search on 5k notes), but as of 2026-07 there are zero benchmarks in the codebase. Performance is evaluated by feel, making it impossible to:

- Quantify whether a change is actually an improvement
- Detect regressions before they compound
- Compare two approaches (e.g. parallel vs sequential indexing) with confidence
- Justify complexity of optimizations with hard numbers

The author is a solo developer; benchmarking must work in a local-only workflow with minimal ceremony.

## Decision

### Harness: Criterion 0.8

Use [criterion](https://github.com/bheisler/criterion.rs) 0.8 as the benchmark harness. It provides:

- Statistical significance testing (confidence intervals, noise thresholds)
- Baseline comparison (`--save-baseline` / `--baseline`) for before/after measurements
- HTML reports in `target/criterion/reports/`
- Linear regression for throughput benchmarks (iterations per second)

Use `std::hint::black_box` (stable since Rust 1.66) instead of `criterion::black_box` to reduce dependency overhead.

### Structure: Per-crate `[[bench]]` entries

No separate bench crate. Each existing workspace member gets a `[[bench]]` entry in its `Cargo.toml`:

```
crates/basalt-parser/Cargo.toml    → benches/parse_metadata.rs
crates/basalt-vault/Cargo.toml     → benches/index_walk.rs, benches/cache_roundtrip.rs
crates/basalt-search/Cargo.toml    → benches/index_docs.rs, benches/search_query.rs, benches/search_reindex.rs
crates/basalt-graph/Cargo.toml     → benches/graph_insert.rs, benches/graph_query.rs, benches/arena_growth.rs, benches/graph_step.rs
crates/basalt-tables/Cargo.toml    → benches/query_execution.rs
```

Criterion discovers all `[[bench]]` entries across the workspace with a single `cargo bench`.

### Fixture generation

Every bench carries its own inline content generator (`generate_note_content`
in the vault benches, `generate_doc` in the search benches, inline
note/table builders in parser/graph/tables); determinism comes from
index-modulo content rather than a seeded RNG. Tier sizes are ad-hoc per
bench: parser, `search_query`, tables, and `graph_step` include the
AGENTS.md-mandated 25k tier; vault and `index_docs`/`search_reindex` top out
at 5k. Closing the 25k gap in the vault and remaining search benches is a
tracked follow-up.

### Workflow

```
# Before optimization — save baseline
cargo bench -- --save-baseline main

# After optimization — compare
cargo bench -- --baseline main
```

Output: color-coded terminal table showing each benchmark's change with ± confidence interval. If a result shows "CHANGE -12.3% ± 2.1%" the improvement is statistically significant.

`target/criterion/reports/` contains detailed HTML with violin plots, iteration time distributions, and regression charts.

### Benchmark targets

| Benchmark          | Crate           | Measures                                                                 |
| ------------------ | --------------- | ------------------------------------------------------------------------ |
| `parse_metadata`   | `basalt-parser` | Zero-AST scanner throughput — groups `seq_1k`/`parse_frontmatter_1k`/`seq_25k`/`parse_frontmatter_25k` |
| `index_walk`       | `basalt-vault`  | `index_directory` full sweep + reindex — wall-clock time and allocations |
| `cache_roundtrip`  | `basalt-vault`  | `VaultCache::save()` + `load()` on 1k / 5k entries                       |
| `index_docs`       | `basalt-search` | Tantivy `IndexWriter::add_document` throughput                            |
| `search_query`     | `basalt-search` | `index.search(q, 10)` on a fixed query set (no percentile breakdown)     |
| `search_reindex`   | `basalt-search` | Full delete-all + rebuild index cycle                                     |
| `graph_insert`     | `basalt-graph`  | `NoteGraph::add_document` — link rebuild cost per insert                  |
| `graph_query`      | `basalt-graph`  | Backlink lookup latency                                                    |
| `graph_step`       | `basalt-graph`  | One force-layout tick (25k)                                                |
| `arena_growth`     | `basalt-graph`  | `StringArena` memory growth and allocation count vs entry count           |
| `query_execution`  | `basalt-tables` | DQL query execution over a generated 25k-note corpus                      |

## Rationale

- **Criterion over custom harness**: Criterion is the de facto standard for Rust benchmarks (used by Tokio, Serde, and the compiler itself). It handles statistical noise, outlier detection, and cross-run comparison — code that would take weeks to write correctly.
- **Per-crate benches over monolithic crate**: Keeps dependencies minimal. `basalt-parser` benches don't need `tantivy` or `nucleo` on the dependency tree.
- **Deterministic generation over static fixtures**: No binary blobs in git, no stale fixtures. Same input produces the same tree every time, so results are comparable across revisions. Tempdir cleanup means no disk pollution.
- **CI**: the repo now has CI (`.github/workflows/ci.yml`) running clippy + tests; it does not yet run `cargo bench`, so `--baseline main` remains the primary regression gate.

## Consequences

- Every optimization to the parsing/search/vault/graph/tables hot paths is measured with statistical confidence
- Adding a benchmark for new functionality costs ~10 lines of code — low enough to become habit
- `cargo bench` completes in ~2–3 minutes end-to-end
- Criterion HTML reports provide visual history even without CI

* Running benchmarks is a manual step — regressions may go unnoticed until the developer remembers to bench
* Fixture generation runs every bench invocation, adding ~5% overhead to iteration time
* Each crate's `Cargo.toml` gains a `[dev-dependencies]` entry for `criterion` and `tempfile`