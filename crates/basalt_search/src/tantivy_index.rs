use std::path::Path;

use aho_corasick::AhoCorasick;
use anyhow::{Context, Result};
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{
    IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, STRING, STORED,
};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};

use crate::types::{ContentResult, Highlight, Snippet};

/// Wraps a tantivy index storing four fields per note.
/// `body` is indexed but not stored — snippets are built by re-scanning the raw
/// content string supplied to `update_document`.
pub struct TantivyIndex {
    index: Index,
    writer: IndexWriter,
    reader: tantivy::IndexReader,
    path_field: tantivy::schema::Field,
    title_field: tantivy::schema::Field,
    body_field: tantivy::schema::Field,
    tags_field: tantivy::schema::Field,
}

fn build_schema() -> (
    Schema,
    tantivy::schema::Field,
    tantivy::schema::Field,
    tantivy::schema::Field,
    tantivy::schema::Field,
) {
    let mut builder = Schema::builder();

    let stored_text = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("en_stem")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();

    let indexed_only = TextOptions::default().set_indexing_options(
        TextFieldIndexing::default()
            .set_tokenizer("en_stem")
            .set_index_option(IndexRecordOption::WithFreqsAndPositions),
    );

    // STRING = indexed as a single raw token (no stemming) + stored; enables exact-match deletion
    let path_field = builder.add_text_field("path", STRING | STORED);
    let title_field = builder.add_text_field("title", stored_text.clone());
    let body_field = builder.add_text_field("body", indexed_only);
    let tags_field = builder.add_text_field("tags", stored_text);

    (builder.build(), path_field, title_field, body_field, tags_field)
}

impl TantivyIndex {
    /// Open existing index at `dir` or create a fresh one.
    pub fn open_or_create(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating index dir {}", dir.display()))?;

        let (schema, path_field, title_field, body_field, tags_field) = build_schema();

        let mmap_dir =
            MmapDirectory::open(dir).with_context(|| "opening mmap directory")?;

        let mut index = Index::open_or_create(mmap_dir, schema.clone())?;

        // Schema mismatch detection: if the on-disk schema differs from the current
        // build_schema(), wipe the directory and recreate from scratch.
        let current_schema = index.schema();
        if current_schema != schema {
            std::fs::remove_dir_all(dir)
                .with_context(|| format!("removing stale index at {}", dir.display()))?;
            std::fs::create_dir_all(dir)
                .with_context(|| format!("recreating index dir {}", dir.display()))?;
            index = Index::create_in_dir(dir, schema)?;
        }

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let writer = index.writer(50_000_000)?; // 50 MB heap

        Ok(Self {
            index,
            writer,
            reader,
            path_field,
            title_field,
            body_field,
            tags_field,
        })
    }

    /// Add or replace a document. Call after any file save.
    /// `title` is the filename stem. `tags` is space-separated tag tokens.
    pub fn update_document(
        &mut self,
        path: &str,
        title: &str,
        body: &str,
        tags: &str,
    ) -> Result<()> {
        let path_term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(path_term);

        self.writer.add_document(doc!(
            self.path_field  => path,
            self.title_field => title,
            self.body_field  => body,
            self.tags_field  => tags,
        ))?;

        Ok(())
    }

    /// Remove a document by path. Call when a file is deleted.
    pub fn remove_document(&mut self, path: &str) -> Result<()> {
        let path_term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(path_term);
        Ok(())
    }

    /// Flush pending adds/deletes to the index so they become visible to searchers.
    /// Call once after a batch of `update_document`/`remove_document` calls.
    pub fn commit(&mut self) -> Result<()> {
        self.writer.commit()?;
        self.reader.reload()?;
        Ok(())
    }

    /// Number of non-deleted documents currently visible to the reader.
    /// Returns 0 on a freshly created index.
    pub fn doc_count(&self) -> u64 {
        self.reader.searcher().num_docs()
    }

    /// BM25 full-text search. Returns up to `limit` results ranked by relevance.
    /// Snippets are populated separately by `SearchState` using the raw note body.
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<ContentResult>> {
        let searcher = self.reader.searcher();

        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.title_field, self.body_field, self.tags_field],
        );
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
                snippets: vec![],
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
        // Snap ctx_start back to the nearest char boundary at or before the
        // desired offset — walking forward from a safe point avoids any panic.
        let ctx_start = m.start().saturating_sub(60);
        let ctx_start = (0..=ctx_start)
            .rev()
            .find(|&i| body.is_char_boundary(i))
            .unwrap_or(0);

        // Snap ctx_end forward to the nearest char boundary at or after the
        // desired offset. Doing this with is_char_boundary avoids slicing at
        // a non-boundary (the original body[..ctx_end] slice was the panic site).
        let ctx_end_raw = (m.end() + 60).min(body.len());
        let ctx_end = (ctx_end_raw..=body.len())
            .find(|&i| body.is_char_boundary(i))
            .unwrap_or(body.len());

        if seen.iter().any(|(s, e)| ctx_start < *e && *s < ctx_end) {
            continue;
        }
        seen.push((ctx_start, ctx_end));

        let text = body[ctx_start..ctx_end].to_string();
        let rel_start = m.start() - ctx_start;
        let rel_end = m.end() - ctx_start;
        snippets.push(Snippet {
            text,
            highlights: vec![Highlight {
                start: rel_start,
                end: rel_end,
            }],
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
        idx.update_document("/vault/hello.md", "hello", "Hello World", "")
            .unwrap();
        idx.commit().unwrap();
        let results = idx.search("hello", 10).unwrap();
        assert!(!results.is_empty(), "expected at least one result");
        assert_eq!(results[0].path, "/vault/hello.md");
    }

    #[test]
    fn test_remove_document() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document("/vault/a.md", "alpha", "Alpha note body", "")
            .unwrap();
        idx.commit().unwrap();
        idx.remove_document("/vault/a.md").unwrap();
        idx.commit().unwrap();
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
