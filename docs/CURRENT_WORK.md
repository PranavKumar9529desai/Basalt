# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## ADR-047 Excalidraw format adoption — ACTIVE

**Status:** Phases 1–4 committed. Remaining: Phase 5 (migration + round-trip harness), Phase 6 (docs).

### Phase log

| Phase | Commit | What | Gate |
|-------|---------|------|------|
| 1 | `f05e96a` | ADR-047 doc — Obsidian shell spec, evidence table, capabilities | doc written |
| 2 | `72b0303` | Rust core — `create_drawing_file` emitter, bare-line text elements, tighter marker, migration-safe read | 21 tests pass |
| 3 | `36ef4b4` | Marker-authoritative classification in command layer (`is_drawing_content`, `read_drawing` gate) | 22 tests pass |
| 4 | *(pending)* | TS surface — `resolveLeafType` + `is_drawing_file` IPC, `leafType` hint through tabs/openers, mocks + unit tests | tsc clean, 74 tests |
| 5 | — | Migration on save + parse→serialize→parse round-trip harness (11 real fixtures) | all fixtures round-trip |
| 6 | — | Docs: CURRENT_WORK update, `features/drawing/README.md` | |

### Remaining after Phase 6
- Rust batched IPC (separate workstream)
- Plugin host (ADR-018 Phase 5)

---

## Benchmark & ADR-040-046 gate verification — ACTIVE

**Status:** ADR-040-046 implementation is in the tree (source-verified
2026-09-09, table below). Implementation phase closed; active workstream is
measurement: fresh Criterion baseline, per-ADR gate check, then the ADR-046
remainder.

### ADR implementation state (source-verified 2026-09-09)

| ADR                                  | Code                                                                                                                                                                | Gate                             | Gate status                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| 040 typing latency                   | ✅ `packages/editor/src/preview/` — switch dispatch, O(1) code-block cursor, heading-7 bypass, deco caches, pre-allocated list widgets, 48KB lazy path + hysteresis | p95 ≤ 2.0 ms @ 100 KB            | ⏳ optimizing & benchmarking               |
| 041 zero-AST parser + SIMD           | ✅ `crates/basalt-parser` — memchr3, ASCII Tier-1, SpanCursor Tier-2, in-place dedup                                                                                | >500k notes/s @ 25k              | ❓ unverified                              |
| 042 parallel indexing + binary cache | ✅ `basalt-vault` Rayon map-reduce, deferred hashing, `BSLT` bincode cache (magic + atomic rename)                                                                  | ≤250 ms cold / ≤15 ms warm @ 25k | ⏳ unverified                              |
| 043 full-text + fuzzy search         | ✅ `basalt-search` MmapDirectory BM25, nucleo two-stage, SIMD snippets, 10s commit                                                                                  | switcher < 16 ms                 | ❓ unverified                              |
| 044 graph WASM force sim             | ✅ sim + Barnes-Hut + C-ABI wasm + WebGL2 + double-buffer + binary IPC `decodeBinaryGraphSnapshot`                                                                  | graph_step 25k ≤ 16.6 ms         | ✅ 13.70 ms + binary IPC wired             |
| 045 DQL engine                       | ✅ `basalt-tables` Schwartzian sort, streaming top-K heap selection, predicate push-down, 3VL                                                                       | sub-15 ms @ 25k claim            | ⏳ stream top-k heap selection implemented |
| 046 two-tier boot                    | ✅ Complete — instant O(1) warm boot (<20ms) + `fast_scan_flat_tree` + fused worker (`core/indexing.rs`) + background mtime sync + progress toast                   | boot ≤ 60 ms cold / ≤ 20 ms warm | ⏳ implemented, measuring                  |

### Benchmark process (this session)

1. `cargo bench --workspace -- --save-baseline adr040-046` — full release run
   ≈ 24 min (running via `hub` process `bench`).
2. Diff vs the 2026-09-08 baseline (`docs/performance-baseline.md`);
   confirm/refute flagged `index_walk/5000` +73%.
3. Verify gates: parse 25k, index cold/warm, DQL 25k, graph_step 25k.
4. Frontend gates need the app: typing p95 via `dev:editor-benchmark`, search
   via `dev:search-benchmark` (DEV-gated; prod numbers need `VITE_BENCH`
   relaxation).
5. Update `docs/performance-baseline.md` rows with fresh numbers; report.
6. ADR-046 remainder after gates: fused progressive worker `core/indexing.rs`
   (parse once → NoteGraph + Tantivy batch-by-batch), search banner + graph
   progress state, Tier-2 cache save.
7. Not started: Rust batched IPC; plugin host (ADR-018 Phase 5).

---

## Rust test parity (ADR-030 Phase 5) — PLANNED, not started

- wasm-bindgen tests for `frontmatter-wasm` + `graph-wasm` (both use
  `#[wasm_bindgen_test]` and are built standalone via scripts hex).
- Inline unit tests for `basalt-tables` engine/expr internals.

## Pending (separate workstream, coordinate with user)

- `test/editor-testing` render-mode fix + table fix (untracked `render-mode.ts`
  — committed test) — NOT part of Rust commits; confirm branch first.

---

## Release / CI pipeline (handoff-critical)

Release workflow factors (triggers, GitHub Free cost model, macOS-tag-only
rule, version sync, wasm regen, deliberate gaps) are codified in
[`docs/RELEASE.md`](./RELEASE.md). **Any agent doing release or CI work MUST
read it first** — especially: macOS builds only on `v*` tags + manual dispatch;
never add macOS to per-push triggers; sync version across `tauri.conf.json`,
`src-tauri/Cargo.toml`, and `apps/tauri/package.json`; regenerate + commit
WASM before tagging.

## Previous Work (completed, for context)

See git log (all merged to main): native task management (ADR-048, kanban
excluded, FF-merged 2026-09-10, 7 commits), Obsidian Excalidraw plugin compat,
Rust crate quality-hardening (ADR-030, all phases 0–5), frontend/packages
hygiene refactor, settings system (ADR-037), file decomposition (ADR-038),
templates + dailies (ADR-036), split pane layout tree (ADR-032), infinite
canvas (ADR-035), embed rendering (ADR-034), file drag-and-drop, command module
refactor, ADR↔code consistency audit, ADR-039 mermaid/math merge, ADR-023
(inline title + rename), typing-latency campaign (ADR-019/020, p95 = 3.10 ms
@ 100KB), graph view (ADR-021), DQL query engine (ADR-027/028).