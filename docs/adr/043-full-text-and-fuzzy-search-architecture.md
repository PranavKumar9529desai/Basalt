# ADR-043: Full-Text & Fuzzy Search Engine Architecture

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-008 (Native Search Architecture), ADR-017 (Benchmark Infrastructure), ADR-020 (Desktop-Tier Performance), ADR-030 (Rust Crates Quality Refactor)

---

## Context

In an Obsidian-class desktop workspace, search is the primary entry point for navigation and knowledge discovery. Power users with large vaults ($\ge 25,000$ notes) rely heavily on two distinct interactions:

1. **Quick File Switching (`⌘O`)**: The user knows part of a title and wants an instant, typo-tolerant jump to the file ($< 16\text{ms}$).
2. **Full-Text Content Search (`⌘F`)**: The user searches by keyword, phrase, or tag (`tag:project`) across the entire body of all notes with ranked BM25 relevance and contextual snippets ($< 50\text{ms}$ on 25k notes).

In Obsidian (Electron/JavaScript), full-text search across 25,000 notes takes **400ms to 1,500ms**, freezing the search input during typing and causing dropped frames. Furthermore, Obsidian lacks a true inverted index or BM25 scoring in its core JS layer.

Basalt delivers native Rust search using a **Two-Speed Search Model**:

- **`⌘O` (Quick Switcher)**: In-memory Smith-Waterman SIMD fuzzy alignment powered by `nucleo-matcher`.
- **`⌘F` (Full-Text Search)**: Memory-mapped (`MmapDirectory`) BM25 ranked inverted index powered by `tantivy`.

This ADR establishes the performance optimizations, memory allocation reductions, and exhaustive edge-case handling across both search engines and the frontend preview modal.

---

## Benchmark Definition & Metrics

Search performance is evaluated through both native Rust Criterion benches and an in-app React frame benchmark:

### 1. Rust Criterion Benchmarks (`crates/basalt-search/benches/`)

- **`search_query.rs`**: Measures Tantivy BM25 query latency across 1k, 5k, and 25k notes on multi-word, prefix, and tag queries (`tag:project`).
- **`index_docs.rs`**: Measures Tantivy `IndexWriter` document ingestion throughput.
- **`search_reindex.rs`**: Measures full index rebuild cycles.

### 2. Frontend In-App Benchmark (`apps/tauri/src/features/search/lib/benchmark.ts`)

- **`dev:search-benchmark`**: Measures React modal mount (`open-cold`), result installation (`install`), keyboard arrow navigation (`nav-same-file`, `nav-cross-file`), and keystroke input latency against the 16.67ms 60 FPS frame budget.

---

## Obsidian vs. Basalt Comparison

| Metric / Scenario                | Obsidian (Electron / JS)                                                          | Basalt Current State (Rust)                                    | Basalt Target ("Best of Best")                                   |
| :------------------------------- | :-------------------------------------------------------------------------------- | :------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Full-Text Search (25k notes)** | $\approx 400\text{ms} - 1,500\text{ms}$ (Unranked regex/string scans, freezes UI) | $\mathbf{\approx 10\text{ms} - 25\text{ms}}$ _(Tantivy BM25)_  | $\mathbf{\le 5\text{ms}}$ _(Zero-alloc snippet extraction)_      |
| **Quick Switcher (25k files)**   | $\approx 50\text{ms} - 150\text{ms}$ (Noticeable typing lag on 25k)               | $\mathbf{\approx 8\text{ms} - 15\text{ms}}$ _(Nucleo SIMD)_    | $\mathbf{\le 2\text{ms}}$ _(Two-stage scoring + scratch buffer)_ |
| **Search-as-you-type Snippets**  | Reads files from disk on search                                                   | Reads stored `body` from memory-mapped index (`MmapDirectory`) | Pre-filtered SIMD `is_match` + zero-alloc ASCII spans            |
| **UI Preview Navigation**        | Often stutters on rapid arrow holding                                             | CM6 `PreviewPane` re-parses on every arrow                     | Debounced heavy widgets during fast arrow-key scrolling          |

---

## Architectural Optimizations

### 1. Quick Switcher: Two-Stage Scoring (Eliminate 25,000 Heap Allocations)

In `crates/basalt-search/src/nucleo_scorer.rs`, the previous implementation allocated a fresh `match_indices: Vec<u32>` and a `char_to_byte: Vec<u32>` inside the loop for every single file in the vault on **every keystroke** (25,000 allocations per keystroke).

#### The Two-Stage Optimization:

1. **Stage 1 (Score Only)**: Evaluate candidates using `pattern.score(haystack, &mut self.matcher)`. This requires **zero heap allocations** and returns numeric scores directly in CPU registers.
2. **Stage 2 (Highlight Top `limit` Only)**: Only for the top `limit` items (e.g. the 20 files displayed on screen), compute character highlight indices (`pattern.indices`) using a single reusable scratch buffer.
3. **Bounded Top-K Selection**: Instead of sorting the entire 25,000-element vector ($O(N \log N)$), use `select_nth_unstable` / bounded heap ($O(N)$), completing in **$< 0.2\text{ms}$**.

---

### 2. Snippet Extraction: Pre-Filtering & Zero-Alloc Spans

In `crates/basalt-search/src/tantivy/snippets.rs`, `extract_file_matches` previously parsed character indices and allocated `char_byte` vectors for every line of every matching document, even lines with zero matching words.

#### The Optimization:

1. **SIMD `is_match` Fast Filter**: Before allocating any line data or character maps, test the line with `if !matcher.ac.is_match(line) { continue; }`. Aho-Corasick's SIMD scanner skips non-matching lines in nanoseconds with **zero allocations**.
2. **Zero-Alloc ASCII Character Spans**: For lines that match: if `line.is_ascii()`, byte offset is identically equal to character offset ($b \equiv c$), bypassing `char_indices` allocation completely.

---

### 3. Frontend Search Modal: PreviewPane Widget Debouncing

In `SearchModal.tsx` and `PreviewPane.tsx`:
Holding down the arrow keys to scroll through 30 search results fires key repeat events at 40Hz (every 25ms). Instantiating and parsing full CodeMirror 6 live-preview extensions (tables, math, callouts, embeds) on every 25ms tick causes frame drops.

#### The Optimization:

- While keyboard navigation events fire rapidly ($< 50\text{ms}$ apart), render lightweight text with highlighted `<mark>` spans immediately.
- Debounce mounting the heavy interactive CodeMirror 6 live-preview widgets until the user pauses on a result, locking arrow navigation at a solid 60 FPS.

---

## Comprehensive Edge-Case Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SEARCH SYSTEM FAILURE MODE MATRIX                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Quick Switcher: Single-Letter Query Storm (22,000 matches)               │
│    ──> Handled by O(N) bounded Top-K selection (no full vector sort)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Unicode Titles & Highlight Drift (résumé vs. resume)                     │
│    ──> Handled by returning strict UTF-16 code unit offsets matching JS     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Tantivy 1-Letter Prefix Explosion                                        │
│    ──> Handled by capping prefix term expansion for queries < 2 chars       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Uncommitted Edits on Immediate Search (Lazy Commit Delay)                │
│    ──> Handled by flush-before-search invariant; newly typed notes appear   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Segment File Corruption on Power Loss                                    │
│    ──> Handled by catching corrupt index errors and auto-rebuilding cleanly │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. Overlapping Snippet Highlights (query: "car carpet")                     │
│    ──> Handled by interval merging to prevent invalid nested <mark> tags    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 7. Mega-Lines (40KB Minified Code / JSON single lines)                      │
│    ──> Handled by clamping snippet preview window to 250 chars + ellipsis   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 8. Asynchronous Query Race Conditions (Query 1 finishes after Query 2)      │
│    ──> Handled by monotonic searchSeq query sequence ID verification        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Edge-Case Specifications:

#### 1. Overlapping Highlight Interval Merging

If a query contains overlapping terms (e.g. `car` and `carpet`), Aho-Corasick returns matches `[0..3]` and `[0..6]`. Emitting both ranges causes the frontend to construct invalid HTML (`<mark>car<mark>pet</mark></mark>`).
All highlight spans are sorted and merged into disjoint intervals:

```rust
highlights.sort_by_key(|h| h.start);
let mut merged: Vec<Highlight> = Vec::new();
for h in highlights {
    if let Some(last) = merged.last_mut() {
        if h.start <= last.end {
            last.end = last.end.max(h.end);
            continue;
        }
    }
    merged.push(h);
}
```

#### 2. Mega-Line Preview Clamping

When a search term matches on a 40,000-character single line (e.g. minified data dump), serializing the entire line creates massive IPC payload bloat.
The line match window is clamped:

- Extract up to 100 characters before the first match and 150 characters after the last match.
- Prepend and append ellipsis (`...`) if the window was truncated.

#### 3. Flush-Before-Search Invariant

Basalt writes index updates on a 10s idle commit schedule (`IDLE_COMMIT_DELAY`) to preserve SSD endurance. If a user edits a note and immediately presses `⌘F`, the search command invokes `flush_if_due()` before querying the searcher, ensuring newly typed notes appear in search results without delay.

#### 4. Async Search Sequence Guard

In the frontend search store (`useSearchStore`):

```ts
let currentSearchSeq = 0;

export async function runSearch(query: string) {
  const seq = ++currentSearchSeq;
  const results = await invoke<SearchContentResult>("search_content", {
    query,
  });
  if (seq !== currentSearchSeq) return; // Stale query result; drop it
  set({ searchResults: results.files, isSearchLoading: false });
}
```

---

## Verification Plan

1. **Criterion Benchmark**: Run `cargo bench -p basalt-search --bench search_query` verifying $\le 5\text{ms}$ query latency on the 25k tier.
2. **Frontend Paint Benchmark**: Run `dev:search-benchmark` verifying all interaction phases (`open-cold`, `install`, `nav-same-file`, `nav-cross-file`) pass with $p95 \le 16.67\text{ms}$.
3. **Highlight Accuracy Tests**: Verify highlight spans against multi-byte Unicode strings (`résumé`, Japanese titles) and verify overlapping highlight interval merging.
4. **Workspace Tests**: All 16 `basalt-search` tests and search frontend vitest suites must pass clean.
