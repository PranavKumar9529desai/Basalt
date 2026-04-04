# Native Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-speed native search to Basalt — `⌘O` instant file switcher (nucleo) and `⌘F` full-text BM25 search (tantivy) — with incremental index updates wired to the existing vault watcher.

**Architecture:** New `crates/basalt_search` crate owns `TantivyIndex` and `NucleoScorer`, composed into `SearchState` which is added to `AppState`. Two new Tauri commands (`search_content`, `search_files`) bridge to the frontend. Two new modal components (`SearchModal`, `QuickSwitcher`) are mounted in the app shell and registered as commands with hotkeys.

**Tech Stack:** Rust — `tantivy 0.22`, `nucleo-matcher 0.3`, `aho-corasick 1.1`. Frontend — React, Zustand, `@tauri-apps/api/core`.

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `crates/basalt_search/Cargo.toml` | Crate manifest |
| `crates/basalt_search/src/lib.rs` | Public re-exports |
| `crates/basalt_search/src/types.rs` | `ContentResult`, `FileResult`, `Snippet` |
| `crates/basalt_search/src/tantivy_index.rs` | Schema, index lifecycle, search, snippets |
| `crates/basalt_search/src/nucleo_scorer.rs` | Fuzzy file scoring |
| `crates/basalt_search/src/search_state.rs` | Composes both engines, `open_or_create` |
| `apps/tauri/src-tauri/src/commands/search.rs` | `search_content`, `search_files` Tauri commands |
| `apps/tauri/src/features/search/types.ts` | TS mirror of Rust result types |
| `apps/tauri/src/features/search/store.ts` | Zustand store for both modals |
| `apps/tauri/src/features/search/index.ts` | Barrel export |
| `apps/tauri/src/features/search/components/SearchModal.tsx` | `⌘F` full-text modal |
| `apps/tauri/src/features/search/components/QuickSwitcher.tsx` | `⌘O` file switcher modal |

### Modified files
| Path | Change |
|---|---|
| `Cargo.toml` | Add `crates/basalt_search` to workspace members |
| `apps/tauri/src-tauri/Cargo.toml` | Add `basalt_search` dependency |
| `apps/tauri/src-tauri/src/app_state.rs` | Add `search: Arc<RwLock<Option<SearchState>>>` |
| `apps/tauri/src-tauri/src/cache.rs` | Add `search_index_dir()` helper |
| `apps/tauri/src-tauri/src/commands/mod.rs` | Export `search_content`, `search_files` |
| `apps/tauri/src-tauri/src/commands/boot.rs` | Init `SearchState` after vault load (in `boot` and `set_vault`) |
| `apps/tauri/src-tauri/src/watcher.rs` | Pass `search` arc into watcher closure; update index on file change |
| `apps/tauri/src-tauri/src/lib.rs` | Register `search_content`, `search_files` in `invoke_handler` |
| `apps/tauri/src/routes/index.tsx` | Mount `<SearchModal>` and `<QuickSwitcher>` |
| `apps/tauri/src/commands/app-commands.tsx` | Register `search:open` and `switcher:open` commands with hotkeys |

---

## Task 1: `basalt_search` crate scaffold + shared types

**Files:**
- Create: `crates/basalt_search/Cargo.toml`
- Create: `crates/basalt_search/src/lib.rs`
- Create: `crates/basalt_search/src/types.rs`
- Modify: `Cargo.toml` (workspace root)

- [ ] **Step 1: Add crate to workspace**

In `Cargo.toml` (root):
```toml
[workspace]
resolver = "2"
members = [
    "crates/basalt_core",
    "crates/basalt_fs",
    "crates/basalt_wasm",
    "crates/basalt_search",   # ← add this
    "apps/tauri/src-tauri",
]
```

- [ ] **Step 2: Create `crates/basalt_search/Cargo.toml`**

```toml
[package]
name = "basalt_search"
version = "0.1.0"
edition = "2021"

[dependencies]
basalt_core = { path = "../basalt_core" }
basalt_fs   = { path = "../basalt_fs" }
tantivy     = "0.22"
nucleo-matcher = "0.3"
aho-corasick   = "1.1"
serde       = { version = "1", features = ["derive"] }
thiserror   = "2"
anyhow      = "1"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Create `crates/basalt_search/src/types.rs`**

```rust
use serde::{Deserialize, Serialize};

/// A highlighted byte-range within a snippet's text.
/// `start` and `end` are byte offsets into `Snippet::text`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub start: usize,
    pub end: usize,
}

/// A short excerpt from a note body with match positions marked.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    /// Plain text excerpt (~120 chars).
    pub text: String,
    /// Byte ranges within `text` that match the query.
    pub highlights: Vec<Highlight>,
}

/// One result from `search_content` (full-text BM25 search).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentResult {
    /// Absolute path of the note on disk.
    pub path: String,
    /// Filename stem (e.g. `"borrow-checker"` from `rust/borrow-checker.md`).
    pub title: String,
    /// BM25 relevance score.
    pub score: f32,
    /// Up to 3 highlighted excerpts from the note body.
    pub snippets: Vec<Snippet>,
}

/// One result from `search_files` (nucleo fuzzy file switcher).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    /// Absolute path of the note on disk.
    pub path: String,
    /// Nucleo alignment score (higher = better match).
    pub score: u32,
}
```

- [ ] **Step 4: Create `crates/basalt_search/src/lib.rs`**

```rust
pub mod nucleo_scorer;
pub mod search_state;
pub mod tantivy_index;
pub mod types;

pub use search_state::SearchState;
pub use types::{ContentResult, FileResult, Highlight, Snippet};
```

- [ ] **Step 5: Verify the crate compiles**

```bash
cargo check -p basalt_search
```
Expected: compiles with no errors (no logic yet, just type definitions).

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml crates/basalt_search/
git commit -m "feat(search): scaffold basalt_search crate with shared types"
```

---

## Task 2: `TantivyIndex` — schema, open/create, index, remove

**Files:**
- Create: `crates/basalt_search/src/tantivy_index.rs`

- [ ] **Step 1: Write failing test**

Add to the bottom of `crates/basalt_search/src/tantivy_index.rs` (create the file with just the test module first):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_open_create_and_index() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document("/vault/hello.md", "hello", "Hello World", "").unwrap();
        let results = idx.search("hello", 10).unwrap();
        assert!(!results.is_empty(), "expected at least one result");
        assert_eq!(results[0].path, "/vault/hello.md");
    }

    #[test]
    fn test_remove_document() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document("/vault/a.md", "alpha", "Alpha note", "").unwrap();
        idx.remove_document("/vault/a.md").unwrap();
        let results = idx.search("alpha", 10).unwrap();
        assert!(results.is_empty(), "removed doc should not appear in results");
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cargo test -p basalt_search -- tantivy_index 2>&1 | head -20
```
Expected: compile error — `TantivyIndex` not found.

- [ ] **Step 3: Implement `TantivyIndex`**

Replace the file contents with:

```rust
use std::path::Path;

use aho_corasick::AhoCorasick;
use anyhow::{Context, Result};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{
    IndexRecordOption, Schema, TextFieldIndexing, TextOptions, STORED, TEXT,
};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};

use crate::types::{ContentResult, Highlight, Snippet};

/// Wraps a tantivy index storing four fields per note.
/// `body` is indexed but not stored — snippets are built by re-scanning the raw
/// content string supplied to `update_document`.
pub struct TantivyIndex {
    index: Index,
    writer: IndexWriter,
    // field handles cached after schema construction
    path_field: tantivy::schema::Field,
    title_field: tantivy::schema::Field,
    body_field: tantivy::schema::Field,
    tags_field: tantivy::schema::Field,
}

fn build_schema() -> (Schema, tantivy::schema::Field, tantivy::schema::Field, tantivy::schema::Field, tantivy::schema::Field) {
    let mut builder = Schema::builder();

    let stored_text = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("en_stem")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();

    let indexed_only = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("en_stem")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        );

    let path_field  = builder.add_text_field("path",  STORED);
    let title_field = builder.add_text_field("title", stored_text.clone());
    let body_field  = builder.add_text_field("body",  indexed_only);
    let tags_field  = builder.add_text_field("tags",  stored_text);

    (builder.build(), path_field, title_field, body_field, tags_field)
}

impl TantivyIndex {
    /// Open existing index at `dir` or create a fresh one.
    pub fn open_or_create(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating index dir {}", dir.display()))?;

        let (schema, path_field, title_field, body_field, tags_field) = build_schema();

        let index = if Index::exists(&tantivy::directory::MmapDirectory::open(dir)?)? {
            Index::open_in_dir(dir)?
        } else {
            Index::create_in_dir(dir, schema)?
        };

        let writer = index.writer(50_000_000)?; // 50 MB heap

        Ok(Self { index, writer, path_field, title_field, body_field, tags_field })
    }

    /// Add or replace a document. Call after any file save.
    /// `title` is the filename stem. `tags` is space-separated tag tokens.
    pub fn update_document(&mut self, path: &str, title: &str, body: &str, tags: &str) -> Result<()> {
        // Delete any existing doc with this path first.
        let path_term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(path_term);

        self.writer.add_document(doc!(
            self.path_field  => path,
            self.title_field => title,
            self.body_field  => body,
            self.tags_field  => tags,
        ))?;

        self.writer.commit()?;
        Ok(())
    }

    /// Remove a document by path. Call when a file is deleted.
    pub fn remove_document(&mut self, path: &str) -> Result<()> {
        let path_term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(path_term);
        self.writer.commit()?;
        Ok(())
    }

    /// BM25 full-text search. Returns up to `limit` results ranked by relevance.
    /// `raw_body_lookup` is called to get the note body for snippet extraction —
    /// pass a closure that reads the file from disk.
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<ContentResult>> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        let searcher = reader.searcher();

        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.title_field, self.body_field, self.tags_field],
        );
        // Fuzzy tolerance: append ~ to each term automatically if no special syntax used
        let query = query_parser
            .parse_query(query_str)
            .or_else(|_| query_parser.parse_query(&format!("\"{}\"", query_str)))?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher.doc(doc_address)?;
            let path = doc
                .get_first(self.path_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = doc
                .get_first(self.title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            results.push(ContentResult {
                path,
                title,
                score,
                snippets: vec![], // filled in by SearchState using raw body
            });
        }

        Ok(results)
    }
}

/// Build up to `max` highlighted snippets by scanning `body` for `query_terms`.
/// Used by `SearchState::search_content` after tantivy returns result paths.
pub fn extract_snippets(body: &str, query_terms: &[&str], max: usize) -> Vec<Snippet> {
    if query_terms.is_empty() || body.is_empty() {
        return vec![];
    }

    let ac = match AhoCorasick::builder()
        .ascii_case_insensitive(true)
        .build(query_terms)
    {
        Ok(a) => a,
        Err(_) => return vec![],
    };

    let mut snippets: Vec<Snippet> = Vec::new();
    let mut seen: Vec<(usize, usize)> = Vec::new();

    for m in ac.find_iter(body) {
        if snippets.len() >= max {
            break;
        }
        // 60-char context window around the match
        let ctx_start = m.start().saturating_sub(60);
        // snap to char boundary
        let ctx_start = body
            .char_indices()
            .rev()
            .skip_while(|(i, _)| *i > ctx_start)
            .next()
            .map(|(i, _)| i)
            .unwrap_or(0);
        let ctx_end = (m.end() + 60).min(body.len());
        let ctx_end = body[..ctx_end]
            .char_indices()
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(ctx_end);

        // Skip if overlaps with a previous snippet
        if seen.iter().any(|(s, e)| ctx_start < *e && *s < ctx_end) {
            continue;
        }
        seen.push((ctx_start, ctx_end));

        let text = body[ctx_start..ctx_end].to_string();
        let rel_start = m.start() - ctx_start;
        let rel_end = m.end() - ctx_start;
        snippets.push(Snippet {
            text,
            highlights: vec![Highlight { start: rel_start, end: rel_end }],
        });
    }

    snippets
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_open_create_and_index() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document("/vault/hello.md", "hello", "Hello World", "").unwrap();
        let results = idx.search("hello", 10).unwrap();
        assert!(!results.is_empty(), "expected at least one result");
        assert_eq!(results[0].path, "/vault/hello.md");
    }

    #[test]
    fn test_remove_document() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document("/vault/a.md", "alpha", "Alpha note body", "").unwrap();
        idx.remove_document("/vault/a.md").unwrap();
        let results = idx.search("alpha", 10).unwrap();
        assert!(results.is_empty(), "removed doc should not appear in results");
    }

    #[test]
    fn test_extract_snippets() {
        let body = "The quick brown fox jumps over the lazy dog. Rust is fast.";
        let snippets = extract_snippets(body, &["rust"], 2);
        assert_eq!(snippets.len(), 1);
        assert!(snippets[0].text.to_lowercase().contains("rust"));
        assert!(!snippets[0].highlights.is_empty());
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p basalt_search -- tantivy_index
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/basalt_search/src/tantivy_index.rs
git commit -m "feat(search): implement TantivyIndex — schema, CRUD, BM25 search, snippet extraction"
```

---

## Task 3: `NucleoScorer` — fuzzy file switcher

**Files:**
- Create: `crates/basalt_search/src/nucleo_scorer.rs`

- [ ] **Step 1: Write failing test**

Create the file with just the test block:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_match_finds_best() {
        let paths = vec![
            "/vault/rust-notes/borrow-checker.md".to_string(),
            "/vault/daily/2026-04-01.md".to_string(),
            "/vault/projects/basalt.md".to_string(),
        ];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow-checker"));
    }

    #[test]
    fn test_empty_query_returns_top_items() {
        let paths = vec!["/a.md".to_string(), "/b.md".to_string()];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("", 5);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_add_and_remove_item() {
        let mut scorer = NucleoScorer::new(vec!["/a.md".to_string()]);
        scorer.add_item("/b.md".to_string());
        let results = scorer.search("b", 5);
        assert!(results.iter().any(|r| r.path == "/b.md"));

        scorer.remove_item("/b.md");
        let results = scorer.search("b", 5);
        assert!(!results.iter().any(|r| r.path == "/b.md"));
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cargo test -p basalt_search -- nucleo_scorer 2>&1 | head -10
```
Expected: compile error — `NucleoScorer` not defined.

- [ ] **Step 3: Implement `NucleoScorer`**

Replace file contents:

```rust
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};

use crate::types::FileResult;

/// Scores vault file paths against a query using nucleo's Smith-Waterman
/// fuzzy algorithm — the same engine used by the Helix editor.
/// Operates entirely in RAM on the paths already held in the vault arena.
pub struct NucleoScorer {
    matcher: Matcher,
    items: Vec<String>,
}

impl NucleoScorer {
    pub fn new(items: Vec<String>) -> Self {
        Self {
            matcher: Matcher::new(Config::DEFAULT),
            items,
        }
    }

    /// Fuzzy-score all items against `query` and return top `limit` results.
    /// If `query` is empty, returns the first `limit` items with score 0.
    pub fn search(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        if query.is_empty() {
            return self
                .items
                .iter()
                .take(limit)
                .map(|p| FileResult { path: p.clone(), score: 0 })
                .collect();
        }

        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
        let mut char_buf: Vec<char> = Vec::new();

        let mut scored: Vec<(u32, &str)> = self
            .items
            .iter()
            .filter_map(|item| {
                let haystack = Utf32Str::new(item.as_str(), &mut char_buf);
                pattern
                    .score(haystack, &mut self.matcher)
                    .map(|s| (s, item.as_str()))
            })
            .collect();

        scored.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        scored.truncate(limit);

        scored
            .into_iter()
            .map(|(score, path)| FileResult { path: path.to_string(), score })
            .collect()
    }

    /// Add a new path (e.g. after a file is created). No-op if already present.
    pub fn add_item(&mut self, path: String) {
        if !self.items.contains(&path) {
            self.items.push(path);
        }
    }

    /// Remove a path (e.g. after a file is deleted).
    pub fn remove_item(&mut self, path: &str) {
        self.items.retain(|p| p != path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_match_finds_best() {
        let paths = vec![
            "/vault/rust-notes/borrow-checker.md".to_string(),
            "/vault/daily/2026-04-01.md".to_string(),
            "/vault/projects/basalt.md".to_string(),
        ];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow-checker"));
    }

    #[test]
    fn test_empty_query_returns_top_items() {
        let paths = vec!["/a.md".to_string(), "/b.md".to_string()];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("", 5);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_add_and_remove_item() {
        let mut scorer = NucleoScorer::new(vec!["/a.md".to_string()]);
        scorer.add_item("/b.md".to_string());
        let results = scorer.search("b", 5);
        assert!(results.iter().any(|r| r.path == "/b.md"));

        scorer.remove_item("/b.md");
        let results = scorer.search("b", 5);
        assert!(!results.iter().any(|r| r.path == "/b.md"));
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p basalt_search -- nucleo_scorer
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/basalt_search/src/nucleo_scorer.rs
git commit -m "feat(search): implement NucleoScorer — fuzzy file path ranking via nucleo-matcher"
```

---

## Task 4: `SearchState` — compose engines, init from `Vault`

**Files:**
- Create: `crates/basalt_search/src/search_state.rs`

- [ ] **Step 1: Write failing test**

Create the file with just the test block:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use basalt_fs::Vault;
    use tempfile::tempdir;

    #[test]
    fn test_open_or_create_empty_vault() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let state = SearchState::open_or_create(dir.path(), &vault);
        assert!(state.is_ok());
    }

    #[test]
    fn test_update_and_search_content() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state.update_document("/vault/rust.md", "Rust is a systems language with a borrow checker.", "rust").unwrap();
        let results = state.search_content("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path == "/vault/rust.md");
    }

    #[test]
    fn test_search_files_fuzzy() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state.update_document("/vault/borrow-checker.md", "Body", "").unwrap();
        let results = state.search_files("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow"));
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cargo test -p basalt_search -- search_state 2>&1 | head -10
```
Expected: compile error — `SearchState` not defined.

- [ ] **Step 3: Implement `SearchState`**

```rust
use std::path::Path;

use anyhow::Result;
use basalt_fs::Vault;

use crate::nucleo_scorer::NucleoScorer;
use crate::tantivy_index::{extract_snippets, TantivyIndex};
use crate::types::{ContentResult, FileResult};

/// Top-level search engine. Owns both the tantivy full-text index
/// and the nucleo in-memory file scorer. Stored in `AppState`.
pub struct SearchState {
    tantivy: TantivyIndex,
    nucleo: NucleoScorer,
}

impl SearchState {
    /// Open the persisted tantivy index at `index_dir` (creates it if absent),
    /// then populate the nucleo scorer from the paths already in `vault.arena`.
    pub fn open_or_create(index_dir: &Path, vault: &Vault) -> Result<Self> {
        let tantivy = TantivyIndex::open_or_create(index_dir)?;

        // Collect all .md paths from the vault arena for the file switcher.
        let paths: Vec<String> = vault
            .arena
            .all_strings()
            .filter(|p| p.ends_with(".md"))
            .cloned()
            .collect();

        let nucleo = NucleoScorer::new(paths);
        Ok(Self { tantivy, nucleo })
    }

    /// BM25 full-text search. Reads matched note bodies from disk to build snippets.
    pub fn search_content(&self, query: &str, limit: usize) -> Vec<ContentResult> {
        let mut results = match self.tantivy.search(query, limit) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[search] tantivy error: {e}");
                return vec![];
            }
        };

        // Tokenise query into terms for aho-corasick snippet highlighting.
        let terms: Vec<&str> = query.split_whitespace().collect();

        for result in &mut results {
            if let Ok(body) = std::fs::read_to_string(&result.path) {
                result.snippets = extract_snippets(&body, &terms, 3);
            }
        }

        results
    }

    /// Fuzzy file-name search (nucleo). Requires `&mut self` because
    /// `nucleo_matcher::Matcher::score` takes `&mut self`.
    pub fn search_files(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        self.nucleo.search(query, limit)
    }

    /// Index or re-index a note after it is created or saved.
    /// `path` — absolute path. `content` — raw Markdown text.
    pub fn update_document(&mut self, path: &str, content: &str, tags: &str) -> Result<()> {
        let title = Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(path);

        self.tantivy.update_document(path, title, content, tags)?;
        self.nucleo.add_item(path.to_string());
        Ok(())
    }

    /// Remove a note from both indexes when it is deleted.
    pub fn remove_document(&mut self, path: &str) -> Result<()> {
        self.tantivy.remove_document(path)?;
        self.nucleo.remove_item(path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_fs::Vault;
    use tempfile::tempdir;

    #[test]
    fn test_open_or_create_empty_vault() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let state = SearchState::open_or_create(dir.path(), &vault);
        assert!(state.is_ok());
    }

    #[test]
    fn test_update_and_search_content() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state
            .update_document(
                "/vault/rust.md",
                "Rust is a systems language with a borrow checker.",
                "rust",
            )
            .unwrap();
        let results = state.search_content("borrow", 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].path, "/vault/rust.md");
    }

    #[test]
    fn test_search_files_fuzzy() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state
            .update_document("/vault/borrow-checker.md", "Body text", "")
            .unwrap();
        let results = state.search_files("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow"));
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p basalt_search
```
Expected: all tests across all modules pass.

- [ ] **Step 5: Commit**

```bash
git add crates/basalt_search/src/search_state.rs crates/basalt_search/src/lib.rs
git commit -m "feat(search): implement SearchState composing tantivy + nucleo engines"
```

---

## Task 5: Tauri integration — `AppState`, `cache.rs`, commands

**Files:**
- Modify: `apps/tauri/src-tauri/src/app_state.rs`
- Modify: `apps/tauri/src-tauri/src/cache.rs`
- Create: `apps/tauri/src-tauri/src/commands/search.rs`
- Modify: `apps/tauri/src-tauri/src/commands/mod.rs`
- Modify: `apps/tauri/src-tauri/Cargo.toml`

- [ ] **Step 1: Add `basalt_search` to Tauri's Cargo.toml**

In `apps/tauri/src-tauri/Cargo.toml`, add to `[dependencies]`:
```toml
basalt_search = { path = "../../../crates/basalt_search" }
```

- [ ] **Step 2: Add `search_index_dir` helper to `cache.rs`**

Add at the end of `apps/tauri/src-tauri/src/cache.rs`:
```rust
/// Returns the directory where the tantivy search index for `vault_path` is stored.
/// Uses the same djb2 hash as `cache_filename` so the index is co-located with
/// the vault cache.
pub(crate) fn search_index_dir(app: &tauri::AppHandle, vault_path: &str) -> PathBuf {
    let hash: u32 = vault_path
        .bytes()
        .fold(5381u32, |acc, b| acc.wrapping_mul(33).wrapping_add(b as u32));
    app.path()
        .app_cache_dir()
        .expect("app cache dir unavailable")
        .join(format!("search_{:08x}", hash))
}
```

- [ ] **Step 3: Add `search` field to `AppState`**

Replace `apps/tauri/src-tauri/src/app_state.rs` entirely:
```rust
use std::sync::{Arc, RwLock};

use basalt_fs::{watcher::VaultWatcher, Vault};
use basalt_search::SearchState;

/// Global application state shared across Tauri commands.
pub struct AppState {
    pub vault: Arc<RwLock<Vault>>,
    pub watcher: RwLock<Option<VaultWatcher>>,
    /// `None` until the vault is loaded and the index is ready.
    pub search: Arc<RwLock<Option<SearchState>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(Vault::new())),
            watcher: RwLock::new(None),
            search: Arc::new(RwLock::new(None)),
        }
    }
}
```

- [ ] **Step 4: Create `commands/search.rs`**

```rust
use tauri::State;

use basalt_search::{ContentResult, FileResult};

use crate::app_state::AppState;

#[tauri::command]
pub fn search_content(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ContentResult>, String> {
    let search = state
        .search
        .read()
        .map_err(|_| "search lock poisoned".to_string())?;
    let search = search
        .as_ref()
        .ok_or_else(|| "search index not ready".to_string())?;
    Ok(search.search_content(&query, limit.unwrap_or(20)))
}

/// Note: uses write lock because nucleo-matcher's Matcher::score takes &mut self.
#[tauri::command]
pub fn search_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<FileResult>, String> {
    let mut search = state
        .search
        .write()
        .map_err(|_| "search lock poisoned".to_string())?;
    let search = search
        .as_mut()
        .ok_or_else(|| "search index not ready".to_string())?;
    Ok(search.search_files(&query, limit.unwrap_or(10)))
}
```

- [ ] **Step 5: Export from `commands/mod.rs`**

Add to `apps/tauri/src-tauri/src/commands/mod.rs`:
```rust
pub mod search;
pub use search::{search_content, search_files};
```

- [ ] **Step 6: Verify compilation**

```bash
cargo check -p tauri
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/tauri/src-tauri/
git commit -m "feat(search): add search field to AppState, search commands, cache helper"
```

---

## Task 6: Boot — init `SearchState` after vault load

**Files:**
- Modify: `apps/tauri/src-tauri/src/commands/boot.rs`

- [ ] **Step 1: Init search in `boot` command**

In `boot.rs`, add the following block after `start_watcher(...)` succeeds (before building `tree`). Insert after line 62:

```rust
    // Initialise the search index (non-fatal — vault still works if this fails).
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);
        let vault_guard = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        match SearchState::open_or_create(&index_dir, &vault_guard) {
            Ok(search_state) => {
                if let Ok(mut s) = state.search.write() {
                    *s = Some(search_state);
                }
            }
            Err(e) => eprintln!("[boot] search index failed: {e}"),
        }
    }
```

- [ ] **Step 2: Init search in `set_vault` command**

Add the same block in `set_vault`, after `start_watcher(...)` succeeds (before building `tree`):

```rust
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);
        let vault_guard = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        match SearchState::open_or_create(&index_dir, &vault_guard) {
            Ok(search_state) => {
                if let Ok(mut s) = state.search.write() {
                    *s = Some(search_state);
                }
            }
            Err(e) => eprintln!("[set_vault] search index failed: {e}"),
        }
    }
```

- [ ] **Step 3: Verify compilation**

```bash
cargo check -p tauri
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src-tauri/src/commands/boot.rs
git commit -m "feat(search): init SearchState during boot and set_vault"
```

---

## Task 7: Watcher — update search index on file change

**Files:**
- Modify: `apps/tauri/src-tauri/src/watcher.rs`

- [ ] **Step 1: Replace `start_watcher` to pass search arc into the closure**

Replace `apps/tauri/src-tauri/src/watcher.rs` entirely:

```rust
use std::path::{Path, PathBuf};
use std::sync::Arc;

use basalt_fs::watcher::VaultWatcher;
use serde::Serialize;
use tauri::Emitter;

use crate::app_state::AppState;

#[derive(Serialize, Clone)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
}

pub fn start_watcher(
    state: &AppState,
    vault_path: &str,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let vault_arc = Arc::clone(&state.vault);
    let search_arc = Arc::clone(&state.search);
    let app_handle = app.clone();

    let watcher = VaultWatcher::watch(
        Path::new(vault_path),
        vault_arc,
        move |changed_path: PathBuf| {
            // Update search index on .md file changes.
            if changed_path
                .extension()
                .and_then(|e| e.to_str())
                == Some("md")
            {
                if let Ok(mut guard) = search_arc.write() {
                    if let Some(ref mut search) = *guard {
                        let path_str = changed_path.to_string_lossy().to_string();
                        if changed_path.exists() {
                            if let Ok(content) = std::fs::read_to_string(&changed_path) {
                                // Extract inline tags (#tag) from content for the tags field.
                                let tags: String = content
                                    .split_whitespace()
                                    .filter(|w| w.starts_with('#') && w.len() > 1)
                                    .map(|w| w.trim_start_matches('#'))
                                    .collect::<Vec<_>>()
                                    .join(" ");
                                let _ = search.update_document(&path_str, &content, &tags);
                            }
                        } else {
                            let _ = search.remove_document(&path_str);
                        }
                    }
                }
            }

            // Emit event to frontend (existing behaviour).
            let kind = if changed_path.exists() { "modified" } else { "deleted" };
            let _ = app_handle.emit(
                "vault://file-changed",
                FileChangeEvent {
                    path: changed_path.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                },
            );
        },
    )
    .map_err(|e| format!("failed to start watcher: {e}"))?;

    *state
        .watcher
        .write()
        .map_err(|_| "watcher lock poisoned".to_string())? = Some(watcher);

    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

```bash
cargo check -p tauri
```
Expected: no errors.

- [ ] **Step 3: Register commands in `lib.rs`**

In `apps/tauri/src-tauri/src/lib.rs`, add to the imports:
```rust
use commands::{search_content, search_files, /* ... existing imports ... */};
```

Add to `tauri::generate_handler![]`:
```rust
search_content,
search_files,
```

- [ ] **Step 4: Build the full app**

```bash
cargo build -p tauri 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src-tauri/src/watcher.rs apps/tauri/src-tauri/src/lib.rs
git commit -m "feat(search): wire file watcher to update search index; register IPC commands"
```

---

## Task 8: Frontend types + Zustand store

**Files:**
- Create: `apps/tauri/src/features/search/types.ts`
- Create: `apps/tauri/src/features/search/store.ts`
- Create: `apps/tauri/src/features/search/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
export interface Highlight {
  start: number;
  end: number;
}

export interface Snippet {
  text: string;
  highlights: Highlight[];
}

export interface ContentResult {
  path: string;
  title: string;
  score: number;
  snippets: Snippet[];
}

export interface FileResult {
  path: string;
  score: number;
}
```

- [ ] **Step 2: Create `store.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { ContentResult, FileResult } from "./types";

interface SearchStore {
  // ── Full-text modal (⌘F) ─────────────────────────────────────────────────
  isSearchOpen: boolean;
  searchQuery: string;
  searchResults: ContentResult[];
  isSearchLoading: boolean;
  searchSelectedIndex: number;

  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  runSearch: (query: string) => Promise<void>;
  searchSelectNext: () => void;
  searchSelectPrev: () => void;

  // ── Quick switcher (⌘O) ──────────────────────────────────────────────────
  isSwitcherOpen: boolean;
  switcherQuery: string;
  switcherResults: FileResult[];
  switcherSelectedIndex: number;

  openSwitcher: () => void;
  closeSwitcher: () => void;
  setSwitcherQuery: (query: string) => void;
  runSwitcher: (query: string) => Promise<void>;
  switcherSelectNext: () => void;
  switcherSelectPrev: () => void;
}

export const useSearchStore = create<SearchStore>()((set, get) => ({
  // ── Search modal state ───────────────────────────────────────────────────
  isSearchOpen: false,
  searchQuery: "",
  searchResults: [],
  isSearchLoading: false,
  searchSelectedIndex: 0,

  openSearch: () =>
    set({ isSearchOpen: true, searchQuery: "", searchResults: [], searchSelectedIndex: 0 }),
  closeSearch: () => set({ isSearchOpen: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  runSearch: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], isSearchLoading: false });
      return;
    }
    set({ isSearchLoading: true });
    try {
      const results = await invoke<ContentResult[]>("search_content", {
        query,
        limit: 20,
      });
      set({ searchResults: results, isSearchLoading: false, searchSelectedIndex: 0 });
    } catch (err) {
      console.error("[search] search_content error:", err);
      set({ isSearchLoading: false });
    }
  },

  searchSelectNext: () => {
    const { searchSelectedIndex, searchResults } = get();
    set({ searchSelectedIndex: Math.min(searchSelectedIndex + 1, searchResults.length - 1) });
  },
  searchSelectPrev: () => {
    const { searchSelectedIndex } = get();
    set({ searchSelectedIndex: Math.max(searchSelectedIndex - 1, 0) });
  },

  // ── Switcher state ───────────────────────────────────────────────────────
  isSwitcherOpen: false,
  switcherQuery: "",
  switcherResults: [],
  switcherSelectedIndex: 0,

  openSwitcher: () =>
    set({ isSwitcherOpen: true, switcherQuery: "", switcherResults: [], switcherSelectedIndex: 0 }),
  closeSwitcher: () => set({ isSwitcherOpen: false }),

  setSwitcherQuery: (query) => set({ switcherQuery: query }),

  runSwitcher: async (query) => {
    if (!query.trim()) {
      set({ switcherResults: [] });
      return;
    }
    try {
      const results = await invoke<FileResult[]>("search_files", {
        query,
        limit: 10,
      });
      set({ switcherResults: results, switcherSelectedIndex: 0 });
    } catch (err) {
      console.error("[search] search_files error:", err);
    }
  },

  switcherSelectNext: () => {
    const { switcherSelectedIndex, switcherResults } = get();
    set({ switcherSelectedIndex: Math.min(switcherSelectedIndex + 1, switcherResults.length - 1) });
  },
  switcherSelectPrev: () => {
    const { switcherSelectedIndex } = get();
    set({ switcherSelectedIndex: Math.max(switcherSelectedIndex - 1, 0) });
  },
}));
```

- [ ] **Step 3: Create barrel `index.ts`**

```typescript
export { useSearchStore } from "./store";
export type { ContentResult, FileResult, Highlight, Snippet } from "./types";
```

- [ ] **Step 4: Type-check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src/features/search/
git commit -m "feat(search): add frontend search types and Zustand store"
```

---

## Task 9: `QuickSwitcher` modal (⌘O)

**Files:**
- Create: `apps/tauri/src/features/search/components/QuickSwitcher.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { FileResult } from "../types";

interface QuickSwitcherProps {
  /** Called when the user confirms a result. Receives the absolute file path. */
  onOpen: (path: string) => void;
}

function ResultRow({
  result,
  isSelected,
  onClick,
}: {
  result: FileResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = result.path.split("/");
  const name = parts.pop() ?? result.path;
  const dir = parts.join("/");

  return (
    <Button
      variant="ghost"
      className={[
        "w-full justify-start gap-3 px-4 py-2 h-auto rounded-none",
        isSelected ? "bg-muted text-foreground" : "",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-sm font-medium truncate">{name}</span>
      {dir && (
        <span className="text-xs text-muted-foreground truncate ml-auto shrink-0 max-w-[40%]">
          {dir}
        </span>
      )}
    </Button>
  );
}

export function QuickSwitcher({ onOpen }: QuickSwitcherProps) {
  const {
    isSwitcherOpen,
    closeSwitcher,
    switcherQuery,
    setSwitcherQuery,
    runSwitcher,
    switcherResults,
    switcherSelectedIndex,
    switcherSelectNext,
    switcherSelectPrev,
  } = useSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens.
  useEffect(() => {
    if (isSwitcherOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSwitcherOpen]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSwitcherQuery(q);
      runSwitcher(q);
    },
    [setSwitcherQuery, runSwitcher],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); switcherSelectNext(); }
      if (e.key === "ArrowUp")   { e.preventDefault(); switcherSelectPrev(); }
      if (e.key === "Escape")    { closeSwitcher(); }
      if (e.key === "Enter") {
        const result = switcherResults[switcherSelectedIndex];
        if (result) { onOpen(result.path); closeSwitcher(); }
      }
    },
    [switcherSelectNext, switcherSelectPrev, closeSwitcher, switcherResults, switcherSelectedIndex, onOpen],
  );

  return (
    <Dialog open={isSwitcherOpen} onOpenChange={(o) => { if (!o) closeSwitcher(); }}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-[560px] w-full">
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-base">⌕</span>
          <Input
            ref={inputRef}
            value={switcherQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Open file…"
            className="border-0 shadow-none focus-visible:ring-0 h-auto py-0 bg-transparent"
          />
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {switcherResults.length === 0 && switcherQuery ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No files found</p>
          ) : (
            switcherResults.map((r, i) => (
              <ResultRow
                key={r.path}
                result={r}
                isSelected={i === switcherSelectedIndex}
                onClick={() => { onOpen(r.path); closeSwitcher(); }}
              />
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/tauri/src/features/search/components/QuickSwitcher.tsx
git commit -m "feat(search): implement QuickSwitcher modal (⌘O) with nucleo-powered results"
```

---

## Task 10: `SearchModal` component (⌘F)

**Files:**
- Create: `apps/tauri/src/features/search/components/SearchModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Button } from "@workspace/ui/components/ui/button";
import { Dialog, DialogContent } from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { useCallback, useEffect, useRef } from "react";

import { useSearchStore } from "../store";
import type { ContentResult, Snippet } from "../types";

/** Renders a single snippet with inline highlighted spans. */
function SnippetPreview({ snippet }: { snippet: Snippet }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const h of snippet.highlights) {
    if (h.start > cursor) {
      parts.push(
        <span key={`t-${cursor}`}>{snippet.text.slice(cursor, h.start)}</span>,
      );
    }
    parts.push(
      <mark
        key={`h-${h.start}`}
        className="bg-primary text-primary-foreground rounded-[2px] px-[1px]"
      >
        {snippet.text.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  }
  if (cursor < snippet.text.length) {
    parts.push(<span key="t-end">{snippet.text.slice(cursor)}</span>);
  }

  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
      {parts}
    </p>
  );
}

function ResultRow({
  result,
  isSelected,
  onClick,
}: {
  result: ContentResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = result.path.split("/");
  const dir = parts.slice(0, -1).join("/");

  return (
    <Button
      variant="ghost"
      className={[
        "w-full flex-col items-start gap-1 px-4 py-3 h-auto rounded-none border-l-2",
        isSelected ? "bg-muted border-primary" : "border-transparent",
      ].join(" ")}
      onClick={onClick}
    >
      <div className="flex items-baseline gap-2 w-full">
        <span className="text-sm font-medium truncate">{result.title}</span>
        {dir && (
          <span className="text-[11px] text-muted-foreground truncate">
            {dir}
          </span>
        )}
      </div>
      {result.snippets[0] && <SnippetPreview snippet={result.snippets[0]} />}
    </Button>
  );
}

interface SearchModalProps {
  onOpen: (path: string) => void;
}

export function SearchModal({ onOpen }: SearchModalProps) {
  const {
    isSearchOpen,
    closeSearch,
    searchQuery,
    setSearchQuery,
    runSearch,
    searchResults,
    isSearchLoading,
    searchSelectedIndex,
    searchSelectNext,
    searchSelectPrev,
  } = useSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      // 150 ms debounce before firing tantivy
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(q), 150);
    },
    [setSearchQuery, runSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); searchSelectNext(); }
      if (e.key === "ArrowUp")   { e.preventDefault(); searchSelectPrev(); }
      if (e.key === "Escape")    { closeSearch(); }
      if (e.key === "Enter") {
        const result = searchResults[searchSelectedIndex];
        if (result) { onOpen(result.path); closeSearch(); }
      }
    },
    [searchSelectNext, searchSelectPrev, closeSearch, searchResults, searchSelectedIndex, onOpen],
  );

  return (
    <Dialog open={isSearchOpen} onOpenChange={(o) => { if (!o) closeSearch(); }}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-[640px] w-full">
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-base">⌕</span>
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search in vault…"
            className="border-0 shadow-none focus-visible:ring-0 h-auto py-0 bg-transparent"
          />
          {isSearchLoading && (
            <div className="w-3 h-3 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto">
          {searchResults.length === 0 && searchQuery && !isSearchLoading ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No results found</p>
          ) : (
            searchResults.map((r, i) => (
              <ResultRow
                key={r.path}
                result={r}
                isSelected={i === searchSelectedIndex}
                onClick={() => { onOpen(r.path); closeSearch(); }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          {/* TODO: add #tag filter pill when tag search is wired (v2) */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update barrel export**

Add to `apps/tauri/src/features/search/index.ts`:
```typescript
export { QuickSwitcher } from "./components/QuickSwitcher";
export { SearchModal } from "./components/SearchModal";
```

- [ ] **Step 3: Type-check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/tauri/src/features/search/components/SearchModal.tsx apps/tauri/src/features/search/index.ts
git commit -m "feat(search): implement SearchModal (⌘F) with BM25 results and highlighted snippets"
```

---

## Task 11: Wire modals into the app shell + register hotkeys

**Files:**
- Modify: `apps/tauri/src/commands/app-commands.tsx`
- Modify: `apps/tauri/src/routes/index.tsx`

- [ ] **Step 1: Register search commands in `AppCommands`**

In `apps/tauri/src/commands/app-commands.tsx`, add the import:
```typescript
import { useSearchStore } from "../features/search";
```

Add inside the `AppCommands` component, before `const commands = useMemo(...)`:
```typescript
  const openSearch   = useSearchStore((s) => s.openSearch);
  const openSwitcher = useSearchStore((s) => s.openSwitcher);
```

Add these two entries inside the `commands` array in `useMemo`:
```typescript
      {
        id: "search:open",
        name: "Search Vault",
        category: "Search",
        hotkeys: ["Ctrl+F", "Meta+F"],
        callback: openSearch,
      },
      {
        id: "switcher:open",
        name: "Quick Open File",
        category: "Search",
        hotkeys: ["Ctrl+O", "Meta+O"],
        callback: openSwitcher,
      },
```

Also add `openSearch` and `openSwitcher` to the `useMemo` dependency array.

- [ ] **Step 2: Mount modals in `routes/index.tsx`**

Add the import near the top of `apps/tauri/src/routes/index.tsx`:
```typescript
import { QuickSwitcher, SearchModal } from "../features/search";
```

Add a `handleSearchOpen` callback inside `RouteComponent`, after `handleSplitDown`:
```typescript
  const handleSearchOpen = useCallback(
    (path: string) => {
      // Re-use the same open flow as clicking a file in the tree.
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      if (node) {
        const tabId = openInPreview({ path: node.path, title: node.name });
        setTabTitle(tabId, node.name);
      }
    },
    [treeNodes, openInPreview, setTabTitle],
  );
```

Add the two modals just before the closing `</div>` of the `return` block:
```tsx
      <SearchModal onOpen={handleSearchOpen} />
      <QuickSwitcher onOpen={handleSearchOpen} />
```

- [ ] **Step 3: Run lint + type-check**

```bash
bun run lint && bunx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Start the dev server and test manually**

```bash
bun run dev
```

Manual checks:
1. Press `⌘F` (macOS) or `Ctrl+F` (Linux/Windows) → `SearchModal` opens
2. Press `⌘O` / `Ctrl+O` → `QuickSwitcher` opens
3. Type a word that appears in a note → results appear within ~200ms
4. Arrow keys navigate the list; `↵` opens the note in the current pane; `Esc` closes
5. Edit and save a note → search results update without restarting the app

- [ ] **Step 5: Commit**

```bash
git add apps/tauri/src/commands/app-commands.tsx apps/tauri/src/routes/index.tsx
git commit -m "feat(search): mount SearchModal + QuickSwitcher in app shell; register ⌘F and ⌘O hotkeys"
```

---

## Task 12: Final — lint, type-check, update CLAUDE.md

- [ ] **Step 1: Full lint + type-check**

```bash
bun run lint && bunx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Full Rust test suite**

```bash
cargo test
```
Expected: all tests pass including the new `basalt_search` tests.

- [ ] **Step 3: Update `CLAUDE.md` status table**

In `CLAUDE.md`, change:
```
| Search | ⏳ Not started (after command palette) |
```
to:
```
| Search (⌘F + ⌘O, tantivy + nucleo) | ✅ Complete — see ADR-008 |
```

- [ ] **Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark native search as complete in CLAUDE.md status table"
```

---

## Future work (not in this plan)

```
// TODO: tag search UI — add #tag pill/filter to SearchModal input row
// TODO: frontmatter/property search — index YAML fields as typed tantivy fields
// TODO: regex mode — detect /pattern/ syntax in query, use tantivy RegexQuery
// TODO: backlink-aware search — combine NoteGraph forward/back links with tantivy scores
// TODO: search result count badge on sidebar search button
```
