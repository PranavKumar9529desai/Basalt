# Benchmarks

## Quick Start

```bash
# Fast iteration (≈2min for all 29 bench functions)
cargo bench --bench parse_metadata --bench index_walk --bench cache_roundtrip --bench index_docs --bench search_query --bench search_reindex --bench graph_insert --bench graph_query --bench arena_growth -- --sample-count 20 --warm-up-time 1 --measurement-time 2

# Against real vault
BENCH_VAULT_PATH=/path/to/vault cargo bench --bench index_walk

# Full precision — save baseline
cargo bench --bench parse_metadata --bench index_walk --bench cache_roundtrip --bench index_docs --bench search_query --bench search_reindex --bench graph_insert --bench graph_query --bench arena_growth -- --save-baseline main

# Compare against baseline
cargo bench --bench parse_metadata --bench index_walk --bench cache_roundtrip --bench index_docs --bench search_query --bench search_reindex --bench graph_insert --bench graph_query --bench arena_growth -- --baseline main

# Single crate
cargo bench --manifest-path crates/basalt-graph/Cargo.toml
```

## What Each Benchmark Measures

### Parser (`basalt-parser`)

| Name                    | Measures                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| `parse_metadata/seq_1k` | `extract_metadata` throughput on 1000 synthetic markdown files (CPU bound) |

### Vault (`basalt-vault`)

| Name                        | Measures                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `index_walk/real_vault/{N}` | Full directory walk + parse on your Obsidian vault (set `BENCH_VAULT_PATH`) |
| `index_walk/synthetic/{N}`  | Same on generated files at N = 50, 500, 5000                                |
| `cache_roundtrip/save/{N}`  | `VaultCache::save` — serialize vault to JSON (disk write + serde)           |
| `cache_roundtrip/load/{N}`  | `VaultCache::load` — deserialize JSON back (disk read + serde)              |

### Search (`basalt-search`)

| Name                         | Measures                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| `index_docs/index/{N}`       | Tantivy `update_document` + `commit` for N files               |
| `search_query/search/{N}`    | 5 queries (prefix, multi-word, miss) against a populated index |
| `search_reindex/reindex/{N}` | Full update-all-documents cycle (open → add → commit)          |

### Graph (`basalt-graph`)

| Name                            | Measures                                            |
| ------------------------------- | --------------------------------------------------- |
| `graph_insert/insert/{N}`       | `NoteGraph::add_document` with 2 links each         |
| `graph_query/backlinks/{N}`     | Backlink lookup throughput                          |
| `graph_query/forward_links/{N}` | Forward link lookup throughput                      |
| `graph_query/metadata/{N}`      | Metadata cache lookup throughput                    |
| `arena_growth/insert/{N}`       | `StringArena::get_or_insert` — interning throughput |
| `arena_growth/lookup_hit/{N}`   | `get_id` on existing strings                        |
| `arena_growth/lookup_miss/{N}`  | `get_id` on missing strings                         |

## Output Interpretation

```
index_walk/real_vault/774
                        time:   [19.453 ms 19.726 ms 20.004 ms]
                        thrpt:  [38.692 Kelem/s 39.237 Kelem/s 39.788 Kelem/s]
                 change:
                        time:   [−14.418% −11.474% −8.4923%]
                        Performance has improved.
```

- **time**: [low mean high] — 95% confidence interval for wall-clock time. Lower is faster.
- **thrpt**: [high mean low] — throughput (elements/second). Higher is faster. Reversed order because it's the inverse of time.
- **change**: percent difference vs saved baseline. Green = faster, red = slower.
- **p < 0.05** at the end means the change is statistically significant.
- **No change in performance detected** = noise, not a real difference.

## Environment Variables

| Variable                    | Effect                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| `BENCH_VAULT_PATH`          | `index_walk` walks real files instead of synthetic — measures actual I/O patterns |
| `CARGO_PROFILE_BENCH_DEBUG` | Set to `true` to disable debug symbol stripping for profiling                     |

## HTML Reports

```
target/criterion/reports/index.html
```

Opens in browser. Shows violin plots, iteration distribution, and regression charts for every benchmark.
