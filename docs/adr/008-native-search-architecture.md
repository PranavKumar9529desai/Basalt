# ADR-008: Native Search Architecture — Tantivy + Nucleo

**Status:** Accepted  
**Date:** 2026-04-04  
**Spec:** [docs/superpowers/specs/2026-04-04-native-search-design.md](../superpowers/specs/2026-04-04-native-search-design.md)

> **Implementation status:** shipped live in `crates/basalt-search`. The
> index lives in the OS app-cache dir (never inside the vault), writes are
> lazy-committed on a 10s idle schedule (not per change), and the IPC
> signatures are as shown below.

## Context

Obsidian's search is JavaScript running in a browser sandbox — it cannot build a real inverted index or leverage SIMD-accelerated text processing. Basalt has a native Rust backend via Tauri. Search is the feature where that advantage is most measurable: sub-150ms full-text search across 5k notes is impossible in JS, straightforward in Rust.

Two distinct search problems exist in the product:

1. **File switching** — user knows roughly what file they want, types a fuzzy name fragment. Must feel instant (< 16ms). Operates on filenames already held in `StringArena` in RAM.
2. **Full-text content search** — user searches by content, keyword, or tag across the entire vault. Requires a ranked inverted index. Acceptable latency: < 150ms for 5k notes.

## Decision

### Two-Speed Search Model

**`⌘O` — Quick File Switcher** powered by `nucleo-matcher`  
**`⌘F` — Full-Text Search Modal** powered by `tantivy`  
**Sidebar search button** — triggers same modal as `⌘F`

These are two distinct tools with different engines, optimal for their respective jobs. They are not unified into one modal.

### Library Choices

#### tantivy (full-text engine)

- Lucene-class inverted index written in Rust; BM25 ranking
- Supports `TermQuery`, `FuzzyTermQuery` (typo tolerance), `PhraseQuery`, `PhrasePrefixQuery`, `BooleanQuery`
- Segment-based append model — incremental updates without full rebuild. Writes are **lazy-committed**: the writer accumulates mutations and commits on a 10s idle timer (`IDLE_COMMIT_DELAY`, `flush_if_due`/`flush_pending` in `crates/basalt-search/src/search_state.rs`), forcing a flush before queries — never one `commit()` per autosave.
- `MmapDirectory` for persistence: OS-managed paging, < 10ms open time regardless of index size
- Indexes ~50MB of Markdown text in < 1 second on desktop hardware
- Production users: Quickwit, ParadeDB, Element.io

**Alternatives considered:**

- `milli` (MeiliSearch's engine) — archived as standalone crate March 2023, LMDB-only (always disk-backed, heavier), no pure-Rust path forward. Rejected.
- `simsearch` — n-gram similarity, no BM25, no persistence, poor relevance for long documents. Rejected.

#### nucleo-matcher (fuzzy scorer)

- Smith-Waterman sequence alignment with word-boundary and consecutive-match bonuses — same algorithm as `fzf`, ~6x faster
- Operates on strings already in RAM — no index overhead
- Used by the Helix editor (closest architectural peer to Basalt)
- License: MPL-2.0 (source disclosure only for modified crate files, does not affect Basalt's source)

**Alternatives considered:**

- `sublime_fuzzy` — unmaintained since 2020, superseded by nucleo. Rejected.
- Tantivy for filenames too — segment overhead is worse than direct scoring for a list of < 50k strings. Rejected.

### Index Schema (tantivy)

Four fields indexed per note:

| Field   | Type | Tokenizer      | Stored  | Notes                                                                       |
| ------- | ---- | -------------- | ------- | --------------------------------------------------------------------------- |
| `path`  | TEXT | `STRING` (raw) | Yes     | Exact-match deletion key                                                    |
| `title` | TEXT | `en_stem`      | Yes     | BM25 relevance; prefix matching at query time                               |
| `body`  | TEXT | `en_stem`      | **Yes** | STORED so snippet/highlight generation reads the body from the mmap'd index |
| `tags`  | TEXT | `en_stem`      | Yes     | Space-separated tags from frontmatter + inline `#tag`                       |

#### Tokenizer Strategy

All content fields use `en_stem` (English stemming). Prefix matching for search-as-you-type is handled at **query time** via `FuzzyTermQuery::new_prefix`, not at index time via edge-ngram.

**Why FuzzyTermQuery::new_prefix instead of edge-ngram?**

`FuzzyTermQuery::new_prefix(term, 0, true)` uses tantivy's FST (finite state transducer) term dictionary to find all indexed tokens that start with the query prefix in O(prefix length) time. "packag" finds "package", "packages", "packaging" — no expensive scan, no index size blowup.

Edge-ngram was evaluated and rejected:

- On `body`, it multiplies index size by 5–10× across thousands of notes (every word "running" → ["r","ru","run","runn","runni","runnin","running"])
- Two-tokenizer setups (ngram at index time, exact at query time) require separate `QueryParser` instances or manual `Term` construction anyway — equal complexity with worse index size
- `FuzzyTermQuery::new_prefix` is tantivy's documented approach for search-as-you-type; it requires no schema changes

**Query construction (per word in query):**

```
word → lowercase
  → FuzzyTermQuery::new_prefix(title_term, 0, true) × 3.0 boost (BoostQuery)
  → FuzzyTermQuery::new_prefix(body_term, 0, true)
  → FuzzyTermQuery::new_prefix(tags_term, 0, true)
  → OR across fields (BooleanQuery::Should)
→ AND across words (BooleanQuery::Must)
```

Title gets 3× score boost so filename matches rank above body matches of the same word.

### Index Persistence

The index lives in the **OS app-cache directory** (never in the vault) at
`app_cache_dir()/search_{:08x}` — a flat djb2 hash of the vault path — using
`MmapDirectory`. On app launch:

1. Load existing index from disk
2. Run `incremental_reindex` (from `crates/basalt-vault/src/indexer.rs`) — diff
   mtimes, re-index changed files only
3. Expose `SearchState` (tantivy `IndexReader` + nucleo scorer) in `AppState`

On file change (via the vault `notify` watcher, `crates/basalt-vault/src/watcher.rs`):

1. Delete stale document from tantivy writer
2. Re-parse and add updated document
3. Flush on the lazy-commit schedule (not per change)

### Tauri IPC Commands (as shipped)

```
search_content(query: String, limit: Option<usize>) -> SearchContentResult { total_hits, files: Vec<FileMatch> }
search_files(query: String, limit: Option<usize>) -> Vec<FileResult>
```

(`limit` defaults to 20 for content / 10 for files; failures surface through
the typed `SearchError`.)

`FileMatch` carries: `path`, `title`, `score`, and `matches: Vec<LineMatch>`. Each
`LineMatch` is one matching line with `line_number`, the full `text`, character-offset
`highlights`, and up to `CONTEXT_LINES` (`ContextLine`s) of neighbouring context
before/after — enough for a LazyVim-style preview pane without a second IPC call.

### Result Interaction

Selecting a result from either modal: opens the note in the **current pane**, scrolls to first match, highlights all matches. No new tab unless user explicitly uses `⌘↵`.

### V1 Scope

- Full-text body search (tantivy BM25)
- Filename fuzzy search (nucleo)
- Tag search (tantivy field query on `tags` field)

### Future Work (not in v1)

- Frontmatter / property search (field queries on indexed YAML fields) — TODO
- Regex mode (`/pattern/` in search input, `RegexQuery` in tantivy) — TODO
- Backlink-aware search (combine NoteGraph + tantivy results) — TODO

## Consequences

- Sub-150ms full-text search on 5k notes — structurally impossible in Obsidian's JS runtime
- Instant file switching via nucleo — no perceived latency
- Incremental, lazy-committed index updates — no per-autosave segment commits, no full rebuild
- Index persists across launches — fast cold start even for 50k-note vaults
- Tag search is a first-class tantivy field query, not a grep

* Tantivy adds ~2MB to binary size
* MPL-2.0 license on nucleo requires source disclosure if the nucleo crate itself is modified (Basalt's own code is unaffected)
* `AppState` carries the search state as one field among several (`vault`,
  `vault_path`, `watcher`, `search`, `self_writes`) — initialized before any
  search command is callable; boot sequence needs a loading state
* Index files never enter the vault (the index lives in the OS app-cache dir),
  so no vault-sync exclusion is needed — the originally-planned `.basalt/`
  `.gitignore` mitigation is unnecessary
