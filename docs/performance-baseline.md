# Basalt — Performance Baseline

> How to measure, what each harness covers, and the current numbers.
> Every surface that already has instrumentation is listed below. Add a row
> when you take a fresh reading; keep this file as the single record of
> "what does the app do today".

## Measurement surfaces

| # | Surface | Instrument | Runs in dev? | Runs in prod? | How to run |
|---|---------|-----------|:---:|:---:|---|
| 1 | **Rust backend compute** (parse, search, graph, tables, vault index) | Criterion (`cargo bench`) | — (release profile) | — (release profile) | `cargo bench --workspace` |
| 2 | **Startup / TTI** | auto `writeTtiReport` → `tti-report.md` | ✅ | ✅ | just launch the app |
| 3 | **Typing latency (full stack)** | `dev:editor-benchmark` | ✅ | ❌ DEV-gated | palette → `dev:editor-benchmark` |
| 4 | **Typing latency (per-extension isolation)** | `dev:editor-benchmark-isolation` | ✅ | ❌ DEV-gated | palette → `dev:editor-benchmark-isolation` |
| 5 | **Main-thread watchdog** (long-task detector) | `dev:watchdog` + `dev:watchdog-report` | ✅ | ❌ DEV-gated | toggle on, interact, dump report |
| 6 | **Search modal (React → pixels)** | `dev:search-benchmark` | ✅ | ✅ (unconditionally registered) | palette → `dev:search-benchmark` |

All reports are written to `<tempdir>/basalt-reports/` (Linux: `/tmp/basalt-reports/`)
via the `write_dev_report` Tauri command — **no devtools needed** (devtools inflate
measurements). Files: `tti-report.md`, `editor-benchmark.md`,
`editor-benchmark-isolation.md`, `search-benchmark.md`, `watchdog-report.md`.

Criterion HTML + JSON land in `target/criterion/` (`estimates.json` per bench; `--save-baseline`/`--baseline` for before/after comparison).

> **⚠️ Dev-only gap.** Surfaces 3–5 are registered inside `if (import.meta.env.DEV)`
> in `apps/tauri/src/shared/commands/devBenchmarks.ts` — they are **stripped from
> prod builds**. To get prod typing/watchdog numbers you must either (a) measure in
> dev (isolation benchmark is still valid as differential attribution) or (b) relax
> the gate to an env flag (`import.meta.env.DEV || VITE_BENCH`).

## Dev vs prod — which to measure

Measure **prod (release)**, not dev, for any absolute number that represents the
user experience:

- **Rust side:** `tauri dev` compiles the backend in **debug** (no `opt-level=3`,
  no fat LTO, `codegen-units` unsplit, unwinding on) → backend work is multiple×
  slower than prod. `tauri build` uses the release profile in `Cargo.toml`
  (`opt-level=3`, `lto="fat"`, `codegen-units=1`, `panic="abort"`).
- **Frontend side:** dev serves **unminified** Vite JS in **React dev mode**
  (React Compiler off), plus HMR overhead. Prod is minified + compiler-enabled.
- Exception: the CM typing path is React-free and does no per-keystroke IPC, so
  dev-vs-prod inflation there is small — but the isolation benchmark's *differential*
  numbers (cost added per extension) are what matter, and they transfer.

## Current Criterion baseline (release, 2026-09-08)

Reproduce: `cargo bench --workspace`. Full run ≈ **24 min** (fat-LTO build is the
long pole; ADR-017's "2–3 min" is stale). Mean ± ~CI, lower is better.

| Bench | Tier | Time |
|---|---|---|
| parse_metadata | seq 1k | 21.83 ms |
| | parse_frontmatter 1k | 16.80 ms |
| parse_metadata_25k | seq 25k | 517.72 ms |
| | parse_frontmatter 25k | 344.65 ms |
| index_walk | synthetic 50 | 1.53 ms |
| | synthetic 500 | 15.46 ms |
| | synthetic 5000 | 392.15 ms |
| | real_vault 774 | 19.73 ms |
| cache_roundtrip | save 5k | 9.28 ms |
| | load 5k | 27.10 ms |
| index_docs | index 5k | 55.38 ms |
| search_query | search 5k | 0.94 ms |
| | search 25k | 2.82 ms |
| search_reindex | reindex 5k | 59.44 ms |
| graph_insert | insert 5k | 304.67 ms |
| graph_query | backlinks 5k | 0.053 ms |
| | forward_links 5k | 0.052 ms |
| graph_step | step 25k | 13.70 ms |
| query_execution | list_sort_limit 25k | 103.86 ms |
| | table_from_tag 25k | 38.88 ms |
| aggregation | where_numeric 25k | 30.01 ms |
| | group_by_count 25k | 33.11 ms |
| | flatten_list_group_by 25k | 35.30 ms |

### Regression signal from this run (vs last saved baseline)

- `index_walk/synthetic/5000`: **+73%** time (388.7→392.2 ms) — flagged regression
  in the live run output. 50/500 tiers improved ~26–30%, so the 5k tier is worth a
  look (largest sample; possibly noise, needs a re-run / `--baseline` confirm).

## Other recorded numbers (gates)

- **Two-tier boot (25,003 notes, `temp_vault_1`, 2026-09-09):**
  - Tier 1 Cold Boot Synchronous Total: **92.69 ms** (`fast_scan_flat_tree` 80.07 ms + `open_fast` 12.61 ms)
  - Tier 1 Warm Boot Synchronous Total: **257.56 ms** (`VaultCache::load` 160.66 ms + `fast_scan_flat_tree` 80.77 ms + `open_fast` 16.13 ms)
  - Tier 2 Background Ingestion: **521.30 ms** (Rayon parallel map-reduce, ~48,000 notes/sec, 5ms cooperative yields)
- **Typing latency, full stack, prod, 100 KB:** p95 = **3.10 ms** (CURRENT_WORK
  2026-09-08; ADR-019 gate ≤ 4 ms). Historical pre-refactor: base 1 ms → full 12 ms
  p95.
- **TTI target** (ADR-020): < 800 ms; webview spawn ~570 ms, boot ~170 ms; speculative
  preboot expected −150 ms+ off launch.
- **Search target** (AGENTS.md): < 150 ms on 5k notes.

## To re-baseline after a change

```
cargo bench --workspace -- --save-baseline <name>   # save current as baseline
cargo bench --workspace -- --baseline <name>        # compare a change against it
```
