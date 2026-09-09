# ADR-046: Instant Two-Tier Boot & Decoupled Indexing Architecture

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-020 (Desktop-Tier Performance Architecture), ADR-040 (Editor Typing Latency Optimization), ADR-042 (Vault Parallel Indexing & Binary Cache Architecture)

---

## 1. Context & The 25k Vault Bottleneck

Basalt is designed for power users whose vaults contain $\ge 25,000$ notes and extensive linked documents. In testing with a synthetic 25k vault fixture (`/home/pranav/Documents/temp_vault_1`, 25,005 markdown notes, ~137MB raw text), opening the vault in Basalt froze the user interface for **11.6 to 13.2 seconds**. During this freeze:
- The window was completely unresponsive (clicks, keyboard input, and DevTools inspection stalled).
- On Linux WebKitGTK, the webview renderer event loop is shared or tightly coupled with synchronous Tauri command dispatches. When the Rust backend thread blocks during `boot` or `set_vault`, the UI thread starves.

In contrast, **Obsidian** handles this identical 25k vault smoothly:
- The main window renders immediately ($< 100\text{ms}$).
- The file explorer tree appears and becomes interactable immediately.
- The active note opens and can be edited without delay.
- A circular progress toast appears in the bottom-right corner: *"Indexing vault... X% completed (N / 25,000 notes)"*.
- The user can freely navigate and type while indexing proceeds asynchronously in the background.

### Empirical Breakdown of Basalt's Cold Boot (25,005 Notes)

Using our Criterion and standalone measurement harnesses (`measure_boot.rs` and `measure_parse.rs`):

| Operation | Latency | Root Cause |
| :--- | :--- | :--- |
| **Raw Disk Read (25k files, 137MB)** | **835 ms** | OS filesystem cache / NVMe parallel I/O throughput. |
| **Metadata Extraction (`extract_metadata`)** | **300 ms** | Fast zero-AST byte scanning (ADR-041). |
| **Frontmatter YAML Parsing** | **288 ms** | SIMD/lookup-table YAML parser. |
| **Full Graph Build (`index_directory`)** | **11,600 ms** | Synchronous note graph insertion, wikilink normalization, and asset scanning. |
| **Directory-Only Walk (`build_flat_tree`)** | **95 ms** | Traverses directory paths without reading note content. |
| **Search State Open (`open_fast`)** | **14 ms** | Tantivy index descriptor load + Nucleo memory matcher init. |
| **Bincode Binary Cache Read** | **18 ms** | Direct deserialization of warm cache file. |

### The Critical Insight

The 11-second freeze was caused by a fundamental architectural coupling: **Boot was treating note graph indexing, full-text Tantivy indexing, and file tree display as a single monolithic synchronous transaction.**

However:
1. To render the **File Tree**, the UI only needs `FlatTreeNode` records: `(name, path, rel_path, kind, depth, child_count)`. It does **not** need note bodies, frontmatter, tags, or resolved wikilink edges.
2. To render the **Editor**, CodeMirror 6 only needs the text of the **single active note** (`std::fs::read_to_string` = $0.1\text{ms}$).
3. The heavy compute—parsing 25,000 YAML frontmatter blocks, resolving 50,000 wikilink graph edges, and writing Tantivy inverted indexes—is only needed by the **Graph View**, **Backlinks Panel**, and **Full-Text Search**. None of these block immediate typing or file browsing.

### Architecture Validation (research, 2026-09-09)

The two-tier shape is confirmed by how the reference implementation actually works, plus the technology constraints:

- **Obsidian's documented event sequence:** the workspace renders (`onLayoutReady`) **before** its in-memory `MetadataCache` begins asynchronously parsing files; per-file `changed` events fire as parsing completes. The graph view and backlinks are backed by that cache, which **populates progressively** — on very large vaults (e.g. 57k-note reports on the forums), Obsidian shows partial graph/backlink data with a progress popup, never a blocked UI.
- **Obsidian's persistence:** the metadata cache is rebuilt only when out of sync with the vault; a full reindex is the exception, not the default.
- **Tauri's threading model:** synchronous `#[tauri::command]` functions run on the main thread and block the WebView renderer — the observed freeze is the documented failure mode. The fix is a short synchronous Tier 1 plus heavy work on a detached thread.
- **Tantivy batching:** commits are blocking segment flushes and many small segments hurt query performance, so background indexing must batch (`2500` docs per commit) with a single final commit — not commit per micro-batch.

---

## 2. Decision: Two-Tier Startup Architecture

We decouple the application startup into two strictly separated tiers, with a **mode split on cache state**:

```
[ App Launch / set_vault ]
           │
           ├── cache hit?  ──► Tier 1 (sync, ~470ms): bincode load + incremental reindex
           │                    → vault FULLY populated, tree + search ready — DONE
           │
           └── cache miss (cold / corrupted) ──► [ TIER 1: FAST PATH (< 60ms) ]
                                │   • fast_scan_flat_tree(vault_path) (~30ms, directory entries only)
                                │   • Read active note from disk (~0.1ms)
                                │   • SearchState::open_fast (<15ms)
                                │   • Return BootResult ──► Window paints + File Tree renders + Editor mounts
                                │
                                └──► [ TIER 2: PROGRESSIVE BACKGROUND WORKER ] ──(Detached Thread)
                                      • Fused single-pass parse: 250 notes/batch, 5ms yield
                                      • ONE parse feeds BOTH NoteGraph (progressive upsert) + Tantivy
                                      • Emit `vault://indexing-progress` events (bottom-right toast)
                                      • Atomically save `cache.bincode` on completion
```

### Mode 1 — Warm Boot (cache hit): keep the synchronous incremental path

Measured cost: bincode load (18ms) + `incremental_reindex` (mtime-diffed, ~450ms) ≈ **470ms to a fully populated vault + search-ready state**. No background complexity, no partially-empty graph surface, no race windows.

**Decision:** a valid `.bincode` cache keeps the current synchronous incremental boot untouched. Two-tier (empty vault during Tier 2) buys nothing on this path; its cost — gating graph/search behind indexing — is only justified when the alternative is an 11-second freeze. This matches Obsidian: rebuild the cache only when it is missing or out of sync.

### Mode 2 — Cold Boot (cache miss): Tier 1 fast path (< 60ms)

Tier 1 runs synchronously during the `boot` or `set_vault` command, but performs **zero** file content reads or graph construction:
1. **`fast_scan_flat_tree(vault_path)`**:
   - Performs a fast filesystem walk using Linux `getdents64` (via `walkdir` or vectorized directory iteration), skipping hidden directories (`.git`, `.basalt`, `.obsidian`, `node_modules`).
   - Collects only file and directory paths; no `stat()` on entries where `DirEntry::file_type()` suffices.
   - Sorts paths case-insensitively with folders first, matching Obsidian's tree order.
   - Produces `Vec<FlatTreeNode>` in **$\le 30\text{ms}$** for 25,000 files — **independent of the Vault struct** (pure filesystem input, not `metadata_cache`).
2. **Active Note Hydration**:
   - Reads the active note specified in `.basalt/workspace.json` directly from disk (`std::fs::read_to_string`). Cost: **$< 0.5\text{ms}$**.
3. **Search Engine Fast Open**:
   - `SearchState::open_fast` initializes the Tantivy index reader and Nucleo fuzzy scorer from disk in **$14\text{ms}$**.
4. **Immediate Window Paint**:
   - `boot` returns `BootResult` with `indexing: true` and a possibly-empty `state.vault`.
   - The webview renders the sidebar file tree via `@tanstack/react-virtual` and mounts the active note in CodeMirror 6.
   - **Total time to interactive (TTI): $< 60\text{ms}$ cold, $< 20\text{ms}$ warm.**

### Mode 2 — Tier 2: Progressive Background Ingestion & Graph Building

Immediately upon completing Tier 1, a **single fused worker thread** is spawned:

1. **Fused single-pass parse (parse once, feed both engines)**:
   - Processes notes in batches of 250 files using Rayon parallel map (`extract_metadata`).
   - Each parsed document is **upserted once** into *both* consumers: `NoteGraph` (metadata + wikilink edges + asset index) and the Tantivy writer (title/content/tags).
   - No double disk reads, no duplicated `read_to_string` (the current separate search indexer re-reads every file — eliminated).
2. **Progressive vault population (Obsidian parity)**:
   - `state.vault` is mutated **batch-by-batch**, not swapped atomically at the end.
   - Graph view, backlinks, and tags therefore return **partial-but-growing results immediately** during indexing, gated by an "Indexing in progress (X% complete)" banner — not empty spinners for the full 11s.
   - Upserts are idempotent by canonical path (ADR §6 row 2), so the generation-cancel + vault-switch path stays safe.
3. **Throttled Batching & Cooperative Yielding**:
   - Yields the worker for 5ms (`std::thread::sleep(Duration::from_millis(5))`) between batches, so the Tauri IPC bridge and UI event loop maintain 100% responsiveness while the CPU is never saturated.
4. **Obsidian-Parity Indexing Toast**:
   - Emits Tauri events to the frontend:
     ```json
     { "event": "vault://indexing-progress", "payload": { "indexed": 12500, "total": 25005, "phase": "metadata" } }
     ```
   - The frontend displays `IndexingProgressToast` in the bottom-right corner with a pulse indicator, percentage progress, and note count (already implemented).
5. **Completion**:
   - Flushes Tantivy (one final commit), then atomically saves the `.bincode` cache (`VaultCache::save` via atomic rename) so the next boot is a Mode-1 warm boot.

**Fused worker placement (file structure):** the worker lives in `src-tauri/src/core/` alongside `search_indexer.rs`, under a name like `core/indexing.rs` (or a small `core/indexing/` module) — the *single* file owning parse-once-feed-both. `search_indexer.rs`'s separate disk-reading loop is retired; its batching/yield/progress/generation-cancel patterns carry over unchanged.

---

## 3. Editor Performance Invariants: Instant Open & Sub-16ms Typing

The editor is the core surface of the application. Boot speed and typing latency directly dictate user satisfaction. Basalt enforces three strict invariants for the editor:

### Invariant 1: Instant Note Opening (< 5ms)
When a user clicks any note in the file tree or switches tabs:
- The file content is read directly from disk (`std::fs::read_to_string`).
- It does **not** query or await `AppState.vault` or `NoteGraph`.
- The CodeMirror 6 document is updated via `view.dispatch({ changes: ... })`.
- **Zero React re-renders** of the outer shell occur. Opening a note takes $< 5\text{ms}$ regardless of vault size.

### Invariant 2: Zero-React Keystroke Dispatch
- Keystrokes never dispatch React state updates, never trigger Zustand store notifications, and never invoke Tauri IPC.
- All live preview decorations (headings, bold, italics, callouts, tables, wikilinks, math formulas) are managed strictly inside CodeMirror 6 `StateField`s.
- React only observes document metadata updates through debounced subscribers (300ms idle timer for dirty status and disk auto-save).

### Invariant 3: Sub-16ms Typing Budget Floor ($p95 \le 2.0\text{ms}$ @ 100KB)
To prevent caret jitter, dropped frames, and input stuttering on large documents:
1. **Fused Single-Pass AST Walk (`collector.ts`)**:
   - A single pre-order traversal walks the Lezer Markdown syntax tree.
   - Block-level and inline decorations are gathered in one pass.
2. **Monotonic Index Cursors**:
   - Containment checks (e.g. `isInCodeBlock`) advance a monotonic cursor ($O(1)$ amortized) rather than executing binary searches ($O(\log N)$) on every AST node.
3. **Lazy Remapping for Large Documents ($> 48\text{KB}$)**:
   - For notes exceeding `LAZY_DOC_THRESHOLD` (48KB), single-character keystrokes bypass full AST decoration rebuilds.
   - Existing decorations are shifted using CodeMirror's $O(\Delta)$ position map. Full AST re-indexing is debounced to 150ms of user idle time.
4. **Viewport-Independent StateField**:
   - Scrolling produces zero decoration rebuilds. Decorations outside the viewport are culled by CodeMirror's native drawing layer without recomputing AST state.

---

## 4. Rust Engine Optimizations for Maximum Throughput

To ensure Tier 1 and Tier 2 run with state-of-the-art native speed:

### 1. Vectorized Directory Scanning
Rather than recursively walking paths with standard `std::fs::read_dir` which incurs per-entry allocation overhead, `fast_scan_flat_tree` uses:
- Reused string buffers for path concatenation.
- Directory entry type inspection (`DirEntry::file_type()`), avoiding separate `stat()` syscalls.
- Folders and files partitioned into contiguous pre-allocated vectors before sorting.

### 2. High-Performance Global Memory Allocator (`mimalloc`)
Rayon parallel map-reduce creates high allocation and deallocation rates across worker threads when reading tens of thousands of strings. The standard glibc allocator exhibits lock contention under high-core multithreaded workloads.
- We configure `mimalloc` as the global allocator in `src-tauri/src/main.rs`:
  ```rust
  #[global_allocator]
  static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;
  ```
- This reduces multi-threaded allocation latency by $30\%\text{–}45\%$ during bulk parsing. **Already landed; no change.**

### 3. Generation-Counted Lock-Free Invalidation
When a user switches vaults while background indexing is in progress:
- An atomic generation counter (`indexing_generation: AtomicU64`) is incremented.
- Background worker threads inspect this counter between batches:
  ```rust
  if current_gen != state.indexing_generation.load(Ordering::Relaxed) {
      return; // Canceled cleanly without holding locks
  }
  ```
- No mutexes or channels are blocked during vault switches. **Already landed; no change.**

### 4. Fused Worker + Progressive Vault Mutation
- One worker, one disk read per file, one `extract_metadata` call → both `NoteGraph` and Tantivy. Eliminates the current double-read (vault index + independent search indexer).
- Batch-granular `state.vault` mutation under a **short write lock** per batch, so graph/backlinks/tags readers see partially-populated-but-consistent snapshots rather than a torn state.
- The final `.bincode` write is the only atomic-rename step, and only after the last batch.

---

## 5. Obsidian vs. Basalt Comparison Matrix

| Metric / Experience | Obsidian (Electron / Node.js) | Basalt Prior Architecture | Basalt Two-Tier Target ("Best of Best") |
| :--- | :--- | :--- | :--- |
| **Cold Startup Time (25k notes)** | $\approx 2.5\text{s} - 4.5\text{s}$ | $11.6\text{s} - 13.2\text{s}$ (Total UI freeze) | $\mathbf{\le 60\text{ms}}$ (Window + tree + editor interactive) |
| **Warm Startup Time (25k notes)** | $\approx 1.2\text{s} - 2.0\text{s}$ | $\approx 450\text{ms}$ (Bincode cache parse) | $\mathbf{\le 20\text{ms}}$ (Instant preboot cache hit) |
| **File Tree Rendering** | Progressive virtual tree | Blocked until full 25k parse completes | **Immediate** ($< 30\text{ms}$ fast scan) |
| **Active Note Open Latency** | $\approx 20\text{ms} - 50\text{ms}$ | Blocked behind cold index | $\mathbf{\le 1.0\text{ms}}$ (Direct disk read) |
| **Editor Typing Latency (100KB, p95)** | $15\text{ms} - 35\text{ms}$ (Visible caret stutter) | $3.1\text{ms} - 4.0\text{ms}$ (Passed ADR-019) | $\mathbf{\le 2.0\text{ms}}$ (Fused walk + lazy map) |
| **Background Indexing Feedback** | Bottom-right sonar progress toast | Invisible background stall | **Obsidian-parity animated progress toast** |
| **Graph / Backlinks During Index** | Partial data, progressive cache fill | Empty (blocked behind full index) | **Partial-but-growing results + "Indexing in progress" state** |
| **UI Responsiveness During Index** | 60 FPS (Async Node threads) | 0 FPS (UI freeze on Linux) | **60 FPS** (Throttled Rayon worker with yields) |

---

## 6. Comprehensive Edge-Case Matrix

| Edge Case Scenario | Failure Mechanism | Architectural Safeguard |
| :--- | :--- | :--- |
| **User switches vault mid-indexing** | Worker threads continue indexing abandoned vault, wasting CPU and corrupting state | Atomic `indexing_generation` checked on every 250-note batch; worker terminates immediately if generation changes. |
| **User creates / renames note during Tier 2** | Race condition between Tier 2 batch and filesystem watcher event | Watcher events take precedence; `NoteGraph` and Tantivy use idempotent upsert based on document canonical path. Worker upserts never clobber newer watcher-driven metadata. |
| **Tree refresh during Tier 2 (`get_vault_tree`)** | Rebuilds from a partially-populated `state.vault`, returning a partial tree | `get_vault_tree` moves to `fast_scan_flat_tree` (pure disk walk) — tree output never depends on vault population state, so refreshes are correct in every indexing phase. |
| **User searches before Tier 2 completes** | Tantivy index contains only a subset of notes | Tantivy returns matches from currently indexed subset; search UI shows a subtle banner: *"Indexing in progress (X% complete)"*. |
| **Graph View opened during Tier 2** | `get_graph` invoked while `NoteGraph` is incomplete | Graph view renders the progressively-populated node set with an "Indexing (N notes so far)" indicator, refreshing dynamically as Tier 2 batches land and on completion. |
| **Missing or Corrupted `.bincode` Cache** | Deserialization error during warm startup | Bincode error cleanly logged; falls back transparently to Tier 1 fast scan + Tier 2 fresh index without user disruption. |
| **Vault with 100,000+ Files** | Vector allocation spike in `fast_scan_flat_tree` | `fast_scan_flat_tree` pre-allocates vector capacity based on directory entry counts; avoids intermediate string copies. |
| **Deep Directory Nesting / Symlink Loops** | Infinite recursion or stack overflow in filesystem walk | Filesystem walk caps recursion depth at 64 levels and ignores symlink loops (`follow_links: false`). |
| **User forces full rebuild (`reindex_vault`)** | Long-running command freezes UI again | `reindex_vault` is kept as the manual escape hatch but re-pointed at the same two-tier path: fast scan → immediate result + background fused reindex with progress events. |

---

## 7. Implementation Roadmap & Verification Plan

### Implementation Steps
1. **`basalt-vault: fast_scan_flat_tree`**:
   - Implement `fast_scan_flat_tree(vault_path: &Path) -> Vec<FlatTreeNode>` in `crates/basalt-vault/src/tree/build.rs`.
   - Direct filesystem walk collecting path, name, rel_path, kind, depth, child_count — no `Vault` dependency.
   - Reuse `insert_path` / `insert_disk_dirs` / `flatten_children` (already Vault-independent); only the input source changes from `metadata_cache` to the walk.
   - Move `commands/vault.rs` `get_vault_tree` onto it: tree refreshes never depend on vault population state.
2. **`apps/tauri: Two-Tier boot Command`**:
   - Update `commands/boot.rs` (`boot`, `set_vault`) and `core/cache.rs`:
     - `.bincode` cache hit → keep the synchronous incremental path (Mode 1), unchanged.
     - Cold boot (no/corrupt cache) → `fast_scan_flat_tree` serves `BootResult` in $< 60\text{ms}$ (Mode 2 Tier 1), with `indexing: true`.
     - Dispatch the fused background worker (Mode 2 Tier 2) with batching, 5ms yields, generation-cancel, and progress events.
3. **Fused progressive worker (`core/indexing.rs` or `core/indexing/`)**:
   - Single file owning parse-once-feed-both: per-batch Rayon `extract_metadata` → progressive `state.vault` upsert + Tantivy writer feed.
   - Retire `search_indexer.rs`'s independent disk-reading loop (its constants/patterns migrate into the fused worker).
4. **`apps/tauri: Indexing Toast Integration`**:
   - Wire `vault://indexing-progress` / `vault://indexing-complete` events to the already-implemented `IndexingProgressToast` in `Overlays.tsx` (exists; verify end-to-end on cold boot).
5. **`apps/tauri: Partial-data surfaces`**:
   - Add `indexing: bool` to `BootResult` (Rust + `features/vault/types.ts`).
   - Search: subtle "Indexing in progress (X%)" banner while Tier 2 is live.
   - Graph: progressive node count + refresh-on-complete; backlinks/tags identical (read partial vault, show progress state).

### Verification Gates
1. **Empirical Boot Benchmark**:
   - Run `cargo run --example measure_boot -- /home/pranav/Documents/temp_vault_1`.
   - Gate: Tier 1 flat tree generation $\le 30\text{ms}$; search open $\le 15\text{ms}$; cold TTI $\le 60\text{ms}$; warm TTI $\le 20\text{ms}$.
2. **UI Smoke Test on 25k Vault**:
   - Launch `bun run dev` with `/home/pranav/Documents/temp_vault_1`.
   - Verify window appears in $< 1\text{s}$, file tree renders immediately, active note opens instantly, graph/backlinks show partial data + progress banner, and the bottom-right indexing toast reports smooth progress without UI freeze.
3. **Editor Typing Latency Harness**:
   - Run `bun run dev:editor-benchmark`.
   - Gate: $p95 \le 2.0\text{ms}$ at 100KB document tier.
4. **Code Quality & Rust Gates**:
   - `cargo test --workspace` (all tests pass; parity test: `fast_scan_flat_tree` output equals `build_flat_tree` output on the same fixture).
   - `cargo clippy --workspace --all-targets -- -D warnings` (0 warnings).
   - `bun run lint && cd apps/tauri && bunx tsc --noEmit` (0 errors).

---

## 8. Consequences

- **Cold boot moves from an 11.6s freeze to a $< 60\text{ms}$ interactive window** on 25k-note vaults; the heavy index work proceeds in the background with Obsidian-parity feedback.
- **Graph/backlinks/tags degrade gracefully, not to empty**: progressive population keeps every metadata surface partially useful during cold indexing instead of showing spinners for the full duration.
- **One disk read per file during indexing**: the fused worker eliminates the double-read today's vault-index + search-indexer split performs on 137MB.
- **Warm boots stay boring**: the 470ms synchronous incremental path is untouched, so no regression risk on the common case.
- **`reindex_vault` remains** as the deterministic force-rebuild escape hatch, re-pointed at the same two-tier path.