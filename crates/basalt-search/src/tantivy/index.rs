use std::path::Path;

use super::snippets::extract_file_matches;
use anyhow::{Context, Result};
use tantivy::collector::{Count, TopDocs};
use tantivy::directory::MmapDirectory;
use tantivy::query::{BooleanQuery, BoostQuery, FuzzyTermQuery, Occur, Query};
use tantivy::schema::Value;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument, Term};

use basalt_types::FileMatch;

use super::schema::build_schema;

/// Wraps a tantivy index storing four fields per note.
/// `body` is indexed but not stored — snippets are built by re-scanning the raw
/// content string supplied to `update_document`.
pub struct TantivyIndex {
    #[expect(
        dead_code,
        reason = "owns the tantivy Index — dropping invalidates reader/writer"
    )]
    index: Index,
    writer: IndexWriter,
    reader: tantivy::IndexReader,
    pub(crate) path_field: tantivy::schema::Field,
    pub(crate) title_field: tantivy::schema::Field,
    pub(crate) body_field: tantivy::schema::Field,
    pub(crate) tags_field: tantivy::schema::Field,
}

impl TantivyIndex {
    pub fn new(
        index: Index,
        writer: IndexWriter,
        reader: tantivy::IndexReader,
        path_field: tantivy::schema::Field,
        title_field: tantivy::schema::Field,
        body_field: tantivy::schema::Field,
        tags_field: tantivy::schema::Field,
    ) -> Self {
        Self {
            index,
            writer,
            reader,
            path_field,
            title_field,
            body_field,
            tags_field,
        }
    }

    /// Open existing index at `dir` or create a fresh one.
    pub fn open_or_create(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating index dir {}", dir.display()))?;

        let (schema, path_field, title_field, body_field, tags_field) = build_schema();

        let mmap_dir = MmapDirectory::open(dir).with_context(|| "opening mmap directory")?;

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

    /// BM25 full-text search with search-as-you-type prefix matching.
    ///
    /// Each word in the query is treated as a prefix via `FuzzyTermQuery::new_prefix`
    /// — "packag" finds "package", "ne" finds "new"/"next"/"note" etc. All words
    /// must appear (AND), each word is OR'd across title (3× boost), body, and tags.
    ///
    /// Returns the top `limit` documents with line-level matches built from the
    /// stored `body` field (a cheap in-process mmap read — no filesystem access)
    /// plus the total number of matching documents via tantivy's `Count` collector.
    /// Per-query cost is therefore O(limit), independent of how many files match.
    pub fn search(&self, query_str: &str, limit: usize) -> Result<(Vec<FileMatch>, u64)> {
        let searcher = self.reader.searcher();

        let words: Vec<String> = query_str
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect();

        if words.is_empty() {
            return Ok((vec![], 0));
        }

        // For each word: build a prefix query per field, OR across fields, AND words together.
        let word_queries: Vec<(Occur, Box<dyn Query>)> = words
            .iter()
            .map(|word| {
                let title_term = Term::from_field_text(self.title_field, word);
                let body_term = Term::from_field_text(self.body_field, word);
                let tags_term = Term::from_field_text(self.tags_field, word);

                let title_q: Box<dyn Query> = Box::new(BoostQuery::new(
                    Box::new(FuzzyTermQuery::new_prefix(title_term, 0, true)),
                    3.0,
                ));
                let body_q: Box<dyn Query> =
                    Box::new(FuzzyTermQuery::new_prefix(body_term, 0, true));
                let tags_q: Box<dyn Query> =
                    Box::new(FuzzyTermQuery::new_prefix(tags_term, 0, true));

                let field_or: Box<dyn Query> = Box::new(BooleanQuery::new(vec![
                    (Occur::Should, title_q),
                    (Occur::Should, body_q),
                    (Occur::Should, tags_q),
                ]));

                (Occur::Must, field_or)
            })
            .collect();

        let query = BooleanQuery::new(word_queries);
        // Single pass: collect the top `limit` docs for display AND the exact
        // match count. Counting happens during the same traversal, so `Count`
        // adds ~nothing over a plain TopDocs search.
        let (top_docs, total_docs) =
            searcher.search(&query, &(TopDocs::with_limit(limit), Count))?;
        let total_docs = total_docs as u64;

        let terms: Vec<&str> = words.iter().map(|w| w.as_str()).collect();
        const MAX_MATCHES_PER_FILE: usize = 30;
        const CONTEXT_LINES: usize = 4;

        let mut results = Vec::with_capacity(top_docs.len());
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
            // Body is stored in the index for snippet extraction, but is not
            // sent with every result. The selected preview fetches its body
            // on demand through the existing open_file command.
            let body = doc
                .get_first(self.body_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let matches = if body.is_empty() {
                vec![]
            } else {
                extract_file_matches(&body, &terms, MAX_MATCHES_PER_FILE, CONTEXT_LINES)
            };

            results.push(FileMatch {
                path,
                title,
                score,
                matches,
            });
        }

        Ok((results, total_docs))
    }
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
        let (results, _) = idx.search("hello", 10).unwrap();
        assert!(!results.is_empty(), "expected at least one result");
        assert_eq!(results[0].path, "/vault/hello.md");
    }

    #[test]
    fn test_partial_word_match() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document(
            "/vault/package.md",
            "package manager",
            "Install packages with cargo",
            "",
        )
        .unwrap();
        idx.commit().unwrap();
        let (results, _) = idx.search("packag", 10).unwrap();
        assert!(
            !results.is_empty(),
            "partial word 'packag' should match 'package'"
        );
        let (results, _) = idx.search("pack", 10).unwrap();
        assert!(
            !results.is_empty(),
            "partial word 'pack' should match 'package'"
        );
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
        let (results, _) = idx.search("alpha", 10).unwrap();
        assert!(
            results.is_empty(),
            "removed doc should not appear in results"
        );
    }
}
