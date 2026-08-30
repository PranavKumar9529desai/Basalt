# basalt-search — Native Search & Indexing

Native full-text + fuzzy search. Combines a **persisted Tantivy BM25** index
with a **Nucleo** in-memory fuzzy file-name scorer, plus a lazy/batched commit
policy so indexing never blocks the UI thread.

Depends on `basalt-types`, `basalt-graph`, and `basalt-vault` (native
indexing). Native Rust only — uses the filesystem, no wasm.

## Modules

| Module           | Provides                                                             |
| ---------------- | -------------------------------------------------------------------- |
| `search_state`   | `SearchState` — the app-facing search controller                     |
| `nucleo_scorer`  | `NucleoScorer` — fuzzy file-name matching                            |
| `tantivy`        | `index`, `schema`, `snippets` — the persistent full-text index        |

## Public API

### `SearchState`

| Method              | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `open_or_create(...)` | Open (or build) the on-disk index                            |
| `search_content(q, limit)` | BM25 full-text content search → `SearchContentResult`    |
| `search_files(q, limit)` | Nucleo fuzzy file-name search → `Vec<FileResult>`           |
| `update_document(path, content, tags)` | Upsert a doc; marks the index dirty (lazy commit) |
| `remove_document(path)` | Remove a doc (lazy commit)                                  |
| `commit()`          | Commit pending changes (+ fsync)                              |
| `flush_if_due()`    | Commit if past the idle delay (`IDLE_COMMIT_DELAY`)           |
| `flush_pending()`   | Force-commit pending changes (called before every query)      |

### `NucleoScorer`

`new(paths)`, `search(query, limit)`, `add_item(path, title)`,
`remove_item(path)`.

### Lazy-commit policy

Writes are **batched**, never committed per save: `update_document` /
`remove_document` mark the index pending, `flush_if_due()` commits after 10s
idle, and `flush_pending()` forces a commit before any query so results are
always current. A background flusher thread (started from boot) drains pending
changes. This is deliberate — a Tantivy commit + fsync per autosave would stall
typing.

Search result types (`SearchContentResult`, `FileResult`, highlights, etc.)
are re-exported from `basalt-types`.

## Documentation

- ADR-008: [Native Search Architecture — Tantivy + Nucleo](../../docs/adr/008-native-search-architecture.md)
- [Search backend benchmarks](../../docs/benchmarks.md)
