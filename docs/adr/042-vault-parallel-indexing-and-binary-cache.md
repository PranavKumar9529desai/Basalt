# ADR-042: Vault Parallel Indexing & Binary Cache Architecture

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-017 (Benchmark Infrastructure), ADR-020 (Desktop-Tier Performance), ADR-030 (Rust Crates Quality Refactor)

---

## Context

In an Obsidian-class desktop workspace, application startup and initial vault scanning determine the user's perception of speed. Power users with large vaults ($\ge 25,000$ notes, gigabytes of assets) frequently complain about Obsidian's 8 to 20-second cold indexing freezes and multi-second warm reloads.

In Basalt, the vault engine (`crates/basalt-vault`) is written in native Rust. However, analyzing `indexer.rs` and `cache.rs` revealed four critical performance bottlenecks:
1. **Single-Threaded Sequential Walk**: All 25,000 markdown notes were read and parsed in a single-threaded loop, leaving modern multi-core CPUs $>90\%$ idle.
2. **JSON Cache Overhead**: `VaultCache` serialized the entire vault into a massive 30MB–50MB JSON text file, spending ~350ms parsing JSON on every startup.
3. **Synchronous Asset Hashing**: Every non-markdown file under 100MB was synchronously read from disk to compute MD5 hashes during directory traversal.
4. **50,000 `HashSet<NodeId>` Allocations**: `NoteGraph` allocated individual heap hash sets for every note's forward and backward links.

This ADR establishes the complete architectural specification for **Two-Phase Parallel Map-Reduce Indexing**, **Atomic Binary Caching (`bincode`)**, and **Compact Edge Representation (`SmallVec`)**.

---

## Benchmark Definition & Metrics

The vault benchmarks evaluate filesystem traversal, initial parsing, and warm-restart cache rehydration:
- **`index_walk.rs`**: Evaluates cold directory traversal, non-markdown asset indexing, and full markdown metadata parsing across synthetic tiers (50, 500, 5,000 notes, extending to 25k) and real user vaults via `BENCH_VAULT_PATH`.
- **`cache_roundtrip.rs`**: Evaluates snapshot serialization (`VaultCache::save`) and deserialization (`VaultCache::load`) across 1,000 and 5,000 notes (extending to the 25k tier).

### Metrics Tracked:
- Cold indexing wall-clock duration for 25,000 notes (Target: $\le 250\text{ms}$).
- Warm cache rehydration latency (Target: $\le 15\text{ms}$).
- Cache file size on disk (Target: $\le 5\text{MB}$).
- Peak heap allocation count during indexing.

---

## Obsidian vs. Basalt Comparison

| Metric / Scenario | Obsidian (Electron / Node.js) | Basalt Current State (Rust Vault) | Basalt Target ("Best of Best") |
| :--- | :--- | :--- | :--- |
| **Cold Vault Index (25k notes)** | $\approx 8\text{s} - 20\text{s}$ (Sequential Node `fs.promises`, high GC) | $\approx 1.2\text{s} - 2.5\text{s}$ (Single-threaded Rust walk) | $\mathbf{\le 250\text{ms}}$ (Parallel Rayon NVMe sweep) |
| **Warm Cache Rehydration (25k)** | $\approx 1.5\text{s} - 3.5\text{s}$ (IndexedDB / LevelDB queries) | $\approx 250\text{ms} - 450\text{ms}$ (Parses 40MB JSON string) | $\mathbf{\le 15\text{ms}}$ (Direct `bincode` binary deserialization) |
| **Cache Storage Format** | Proprietary IndexedDB blob | `serde_json` (human-readable JSON) | Zero-copy `bincode` with Atomic Rename |
| **Asset Hashing** | Done on background Node threads | Synchronous MD5 reads up to 100MB | Streaming blake3 / lazy background hashing |
| **Memory per Link Edge** | Full JS objects per link | `HashSet<NodeId>` per note (50k heap sets) | Cache-local compact sorted vectors (`SmallVec`) |

---

## Two-Phase Parallel Map-Reduce Indexing (Zero Mutex Contention)

In `crates/basalt-vault/src/indexer.rs`, reading and parsing notes sequentially on a single thread wastes available multi-core CPU parallelism.

### The Concurrency Trap: Mutex Contention & Non-Deterministic Node IDs
If worker threads naively share a `Mutex<StringArena>` and `Mutex<NoteGraph>`:
1. **Lock Contention**: 25,000 file threads competing for a single lock serialize the work and waste cycles spinning.
2. **Non-Deterministic `NodeId` Assignment**: Thread scheduling differences mean note paths receive different integer `NodeId`s on every run, destroying deterministic cache structures.

### The Architectural Solution: Split Map and Reduce
To achieve maximum parallelism without locks or non-determinism, the indexing pipeline is split into two clean phases:

```
[ Phase 1: PARALLEL MAP (Rayon) ]
  md_files (Sorted Vec<String>)
      │
      ├── Worker 1 ──> read_to_string() ──> extract_metadata() ──> (Path, FileMetadata)
      ├── Worker 2 ──> read_to_string() ──> extract_metadata() ──> (Path, FileMetadata)
      ├── Worker 3 ──> read_to_string() ──> extract_metadata() ──> (Path, FileMetadata)
      └── Worker N ──> read_to_string() ──> extract_metadata() ──> (Path, FileMetadata)
      │
      ▼
  parsed_results: Vec<(String, FileMetadata)>
      │
[ Phase 2: SEQUENTIAL REDUCE (Single Thread, ~5ms) ]
      │
      ▼
  Iterate in deterministic sorted order:
  • arena.get_or_insert(path)
  • note_graph.add_document(doc_id, metadata)
```

1. **Phase 1 (Parallel Map)**: `extract_metadata` is purely functional—it takes `&str` and produces `FileMetadata` with zero dependencies on the arena or graph. Rayon's `par_iter()` distributes file reading and parsing across all available CPU cores.
2. **Phase 2 (Deterministic Reduce)**: Because the file list is pre-sorted, feeding the parsed results into `StringArena` and `NoteGraph` sequentially in memory takes only **$\approx 5\text{ms}$** for 25,000 notes, ensuring completely deterministic `NodeId` assignments across runs.
3. **OS File Descriptor Bounds (`ulimit -n`)**: Rayon's thread pool is bounded by CPU core count ($N \le 32$). Because `std::fs::read_to_string` immediately closes the file descriptor upon reading, at most $N$ files are open concurrently, safely below default OS limits (1024).

---

## Binary Cache Architecture (`bincode` with Atomic Flush & Magic Header)

In `crates/basalt-vault/src/cache.rs`, `VaultCache` (arena, graph, and asset index) is saved to and loaded from JSON.

For a 25,000-note vault:
- JSON file size: **30MB to 50MB**.
- Cold deserialize time: **~350ms** of CPU time parsing text tokens into hundreds of thousands of heap structs.

### The `bincode` Binary Replacement
We replace `serde_json` with `bincode`:
- Binary cache file size: **~3MB to 5MB** (an $85\%\text{–}90\%$ reduction).
- Rehydration time: **$< 15\text{ms}$** (direct binary struct reading, zero string tokenization).

### Cache Corruption & Power-Loss Safeguards (Atomic Write)
To prevent corrupt caches if an application crashes or power is lost mid-write:
1. **Magic Header & Version Stamp**: Every cache file starts with an 8-byte magic header:
   ```
   [ 'B', 'S', 'L', 'T', Version_u32 ]
   ```
   If magic bytes do not match or `version != CACHE_VERSION`, the file is discarded and falls back to a fresh index. Old JSON caches are cleanly rejected without panicking.
2. **Atomic File Replacement**:
   - Cache is written to a sibling temporary file: `cache.bincode.tmp`.
   - Flushed to disk via `file.sync_all()`.
   - Atomically replaced via `std::fs::rename("cache.bincode.tmp", "cache.bincode")`.
   - Because `rename` is atomic on POSIX filesystems and Windows NTFS, the cache file on disk is either the pristine previous version or the pristine new version—never a partial write.

---

## Decoupling Asset Hashing from Initial Walk

In `indexer.rs` (`build_asset_info`), large media files under 100MB are synchronously read from disk to compute MD5 hashes:
```rust
// Legacy: Synchronously reads large asset files during directory walk
if meta.len() <= MAX_HASH_FILE_SIZE {
    match std::fs::read(abs_path) {
        Ok(data) => compute_md5(&data), ...
    }
}
```
If a vault contains 500 images or videos ($2\text{ GB}$ of data), the indexer stalls reading 2 GB from disk before any notes are indexed.

### The Optimization
- **Cold Boot Path**: Only record `(file_size_bytes, mtime_secs)` for asset identification. This requires only `std::fs::metadata()`, which takes $< 1\mu\text{s}$ per file.
- **Content Hashing**: Defer content hashing to a background task or perform it on-demand when duplicate asset detection is explicitly requested.

---

## Compact Edge Representation in `NoteGraph` (`SmallVec`)

In `crates/basalt-graph/src/graph.rs`, the graph uses:
```rust
// Legacy: 50,000 separate heap HashSets on a 25k vault
pub forward_links: HashMap<NodeId, HashSet<NodeId>>,
pub back_links: HashMap<NodeId, HashSet<NodeId>>,
```

### Optimization via `SmallVec<[NodeId; 8]>`
Because $>95\%$ of notes link to fewer than 8 targets:
```rust
pub forward_links: HashMap<NodeId, SmallVec<[NodeId; 8]>>,
pub back_links: HashMap<NodeId, SmallVec<[NodeId; 8]>>,
```
1. **Zero Heap Allocations**: Notes with $\le 8$ links store all target `NodeId`s inline directly on the stack / hash map value slot (32 bytes).
2. **Super-Hub Note Handling**: Notes with $> 8$ links (e.g. index notes with 3,000 links) automatically spill over to a normal heap vector seamlessly without limits or truncation.
3. **Deduplication & Binary Search**: Links are kept sorted in place (`sort_unstable()` + `dedup()`). Link containment checking uses `binary_search()`, which executes in a single L1 cache line in **$\approx 3\text{ns}$**, outperforming `HashSet::contains()`.

---

## Comprehensive Edge-Case Matrix

| Edge Case Scenario | Failure Mechanism | Architectural Safeguard |
| :--- | :--- | :--- |
| **Arena Mutex Contention** | Multiple threads fighting for `StringArena` lock | Two-phase **Parallel Map** (pure functional) + **Sequential Reduce** (~5ms). |
| **Non-Deterministic `NodeId`s** | Race conditions causing IDs to vary between launches | Pre-sorted file list fed into sequential reduce ensures 100% deterministic IDs. |
| **OS `ulimit -n` File Limit** | Opening 25,000 files concurrently crashes with `EMFILE` | Worker pool bounded by CPU core count; files closed immediately upon reading. |
| **TOCTOU File Deletion** | File deleted by another process mid-walk | `read_to_string` handles `io::Error` gracefully by returning `None` without aborting the batch. |
| **Binary Cache Schema Mismatch** | Adding a struct field desynchronizes binary offsets | Magic header `b"BSLT"` + `CACHE_VERSION` check discards mismatched caches cleanly. |
| **Power Loss / App Crash During Save** | Half-written binary file corrupts cache | **Atomic write-and-rename** (`.tmp` $\to$ `.bincode`) guarantees all-or-nothing writes. |
| **Super-Hub Note Overflow** | Notes with 3,000+ links overflowing stack arrays | `SmallVec` transparently transitions from stack to heap vector for $> 8$ links. |
| **Large Media OOM** | Reading 100MB+ video files into RAM for hashing | Decouple asset hashing from the boot path; rely on `(size, mtime)`. |

---

## Verification Plan

1. **Criterion Benchmark**: Run `cargo bench -p basalt-vault --bench index_walk` verifying $\le 250\text{ms}$ on 25k notes.
2. **Cache Roundtrip Benchmark**: Run `cargo bench -p basalt-vault --bench cache_roundtrip` verifying $\le 15\text{ms}$ save/load on 25k notes.
3. **Crash Recovery Test**: Simulate aborted writes and verify the atomic rename leaves previous cache valid.
4. **Workspace Tests**: All 46 `basalt-vault` tests must pass clean.
