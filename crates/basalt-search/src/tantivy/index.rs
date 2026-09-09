use std::path::Path;

use super::snippets::{extract_file_matches, TermMatcher};
use tantivy::collector::{Count, TopDocs};
use tantivy::directory::MmapDirectory;
use tantivy::query::{BooleanQuery, BoostQuery, FuzzyTermQuery, Occur, Query, TermQuery};
use tantivy::schema::{IndexRecordOption, Value};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument, Term};

use basalt_types::FileMatch;

use super::schema::build_schema;
use crate::error::SearchError;

type Result<T> = std::result::Result<T, SearchError>;

/// Wraps a tantivy index storing four fields per note.
/// `body` is indexed but not stored — snippets are built by re-scanning the raw
/// content string supplied to `update_document`.
pub struct TantivyIndex {
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
    ///
    /// Implements ADR-043 self-healing segment file corruption handling:
    /// If an index directory is corrupted (e.g. from a power loss or torn write),
    /// the error is caught, the corrupt directory is wiped and cleanly rebuilt.
    pub fn open_or_create(dir: &Path) -> Result<Self> {
        match Self::try_open_or_create(dir) {
            Ok(idx) => Ok(idx),
            Err(e) => {
                eprintln!(
                    "[search] index open failed or corrupted at {}: {e}; wiping and rebuilding cleanly",
                    dir.display()
                );
                let _ = std::fs::remove_dir_all(dir);
                let _ = std::fs::create_dir_all(dir);
                Self::try_open_or_create(dir)
            }
        }
    }

    fn try_open_or_create(dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(dir)?;

        let (schema, path_field, title_field, body_field, tags_field) = build_schema();

        let mmap_dir =
            MmapDirectory::open(dir).map_err(|e| SearchError::Io(std::io::Error::other(e)))?;

        let mut index = Index::open_or_create(mmap_dir, schema.clone())?;

        // Schema mismatch detection: if the on-disk schema differs from the current
        // build_schema(), wipe the directory and recreate from scratch.
        let current_schema = index.schema();
        if current_schema != schema {
            eprintln!(
                "[search] index schema mismatch at {}; wiping and rebuilding",
                dir.display()
            );
            std::fs::remove_dir_all(dir)?;
            std::fs::create_dir_all(dir)?;
            index = Index::create_in_dir(dir, schema)?;
        }

        // Tags fields reference "basalt_tag" by name — must be registered on the
        // FINAL index instance (the schema-mismatch path above recreates the
        // Index, which has its own tokenizer manager) before any doc is
        // added/searched. Whitespace-only split, no stemming: tag identity
        // survives (`project/2026` stays one token, `ideas` stays `ideas`) so
        // the `tag:` operator matches what the author wrote.
        if index.tokenizers().get("basalt_tag").is_none() {
            index.tokenizers().register(
                "basalt_tag",
                tantivy::tokenizer::TextAnalyzer::builder(
                    tantivy::tokenizer::SimpleTokenizer::default(),
                )
                .build(),
            );
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

    /// Extract the stemmed root using the index's "en_stem" tokenizer.
    fn stem_word(&self, word: &str) -> Option<String> {
        let mut analyzer = self.index.tokenizers().get("en_stem")?;
        let mut stream = analyzer.token_stream(word);
        if stream.advance() {
            let stemmed = stream.token().text.clone();
            if !stemmed.is_empty() && stemmed != word {
                return Some(stemmed);
            }
        }
        None
    }

    /// BM25 full-text search with search-as-you-type prefix matching.
    ///
    /// Each word in the query is treated as a prefix via `FuzzyTermQuery::new_prefix`
    /// — "packag" finds "package", "ne" finds "new"/"next"/"note" etc. All words
    /// must appear (AND), each word is OR'd across title (3× boost), body, and tags.
    ///
    /// A `tag:`-prefixed word (lowercase or not) is scoped to the tags field
    /// only — `tag:proj` finds notes tagged `project` without matching body
    /// text. Tag words AND with each other and with any plain words.
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

        // `tag:x` words scope to the tags field; everything else keeps the
        // cross-field full-text behavior. Split before building clauses.
        let (tag_words, fulltext): (Vec<&String>, Vec<&String>) =
            words.iter().partition(|w| w.starts_with("tag:"));

        let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();

        for tag_word in &tag_words {
            let Some(tag) = tag_word.strip_prefix("tag:") else {
                continue;
            };
            if tag.is_empty() {
                continue;
            }
            let tags_term = Term::from_field_text(self.tags_field, tag);
            // 1-letter prefix explosion prevention (ADR-043):
            let tag_q: Box<dyn Query> = if tag.chars().count() < 2 {
                Box::new(TermQuery::new(
                    tags_term,
                    IndexRecordOption::WithFreqsAndPositions,
                ))
            } else {
                Box::new(FuzzyTermQuery::new_prefix(tags_term, 0, true))
            };
            clauses.push((Occur::Must, tag_q));
        }

        // For each full-text word: build a prefix query per field (or TermQuery if < 2 chars),
        // OR across fields, AND words together.
        for word in &fulltext {
            let title_term = Term::from_field_text(self.title_field, word);
            let body_term = Term::from_field_text(self.body_field, word);
            let tags_term = Term::from_field_text(self.tags_field, word);

            // 1-letter prefix explosion prevention (ADR-043):
            let mut field_clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();

            if word.chars().count() < 2 {
                field_clauses.push((
                    Occur::Should,
                    Box::new(BoostQuery::new(
                        Box::new(TermQuery::new(
                            title_term,
                            IndexRecordOption::WithFreqsAndPositions,
                        )),
                        3.0,
                    )),
                ));
                field_clauses.push((
                    Occur::Should,
                    Box::new(TermQuery::new(
                        body_term,
                        IndexRecordOption::WithFreqsAndPositions,
                    )),
                ));
                field_clauses.push((
                    Occur::Should,
                    Box::new(TermQuery::new(
                        tags_term,
                        IndexRecordOption::WithFreqsAndPositions,
                    )),
                ));
            } else {
                field_clauses.push((
                    Occur::Should,
                    Box::new(BoostQuery::new(
                        Box::new(FuzzyTermQuery::new_prefix(title_term, 0, true)),
                        3.0,
                    )),
                ));
                field_clauses.push((
                    Occur::Should,
                    Box::new(FuzzyTermQuery::new_prefix(body_term, 0, true)),
                ));
                field_clauses.push((
                    Occur::Should,
                    Box::new(FuzzyTermQuery::new_prefix(tags_term, 0, true)),
                ));

                // If word stems to a shorter or different root, also match the stemmed root
                if let Some(stemmed) = self.stem_word(word) {
                    let stemmed_title_term = Term::from_field_text(self.title_field, &stemmed);
                    let stemmed_body_term = Term::from_field_text(self.body_field, &stemmed);
                    field_clauses.push((
                        Occur::Should,
                        Box::new(BoostQuery::new(
                            Box::new(FuzzyTermQuery::new_prefix(stemmed_title_term, 0, true)),
                            3.0,
                        )),
                    ));
                    field_clauses.push((
                        Occur::Should,
                        Box::new(FuzzyTermQuery::new_prefix(stemmed_body_term, 0, true)),
                    ));
                }
            }

            let field_or: Box<dyn Query> = Box::new(BooleanQuery::new(field_clauses));

            clauses.push((Occur::Must, field_or));
        }

        if clauses.is_empty() {
            // Only empty `tag:` words — nothing to match.
            return Ok((vec![], 0));
        }

        let query = BooleanQuery::new(clauses);
        // Single pass: collect the top `limit` docs for display AND the exact
        // match count. Counting happens during the same traversal, so `Count`
        // adds ~nothing over a plain TopDocs search.
        let (top_docs, total_docs) =
            searcher.search(&query, &(TopDocs::with_limit(limit), Count))?;
        let total_docs = total_docs as u64;

        // Excerpt matching uses the words WITHOUT the `tag:` prefix — the
        // tag itself is what should highlight in the body snippet.
        let mut terms: Vec<&str> = Vec::new();
        for tag_word in &tag_words {
            terms.push(tag_word.strip_prefix("tag:").unwrap_or(tag_word));
        }
        for w in &fulltext {
            terms.push(w);
        }
        // Build the case-insensitive matcher once for the whole query, then reuse
        // it across every result doc (avoids rebuilding the AhoCorasick automaton
        // per document — ADR-030 §2.5).
        let matcher = TermMatcher::new(&terms);
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

            let matches = match &matcher {
                Some(m) if !body.is_empty() => {
                    extract_file_matches(&body, m, MAX_MATCHES_PER_FILE, CONTEXT_LINES)
                }
                _ => vec![],
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

    /// Three docs sharing tag words in different combinations: the `tag:`
    /// operator must scope to the tags field and AND across words.
    fn indexed_tag_fixture() -> (tempfile::TempDir, TantivyIndex) {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document(
            "/vault/project.md",
            "project plan",
            "Build the plan",
            "project",
        )
        .unwrap();
        idx.update_document(
            "/vault/ideas.md",
            "ideas",
            "project ideas here",
            "project ideas",
        )
        .unwrap();
        idx.update_document("/vault/other.md", "other", "unrelated note", "misc")
            .unwrap();
        idx.commit().unwrap();
        (dir, idx)
    }

    #[test]
    fn test_tag_operator_scopes_to_tag_field() {
        let (dir, idx) = indexed_tag_fixture();
        // `tag:project` matches tagged docs even though "project" also appears
        // in ideas.md's BODY — scoping must exclude the plain-text hit.
        let (results, _) = idx.search("tag:project", 10).unwrap();
        let mut paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        // BM25 order is score-based, not insertion — compare as sets.
        paths.sort_unstable();
        assert_eq!(paths, vec!["/vault/ideas.md", "/vault/project.md"]);
        let _ = dir;
    }

    #[test]
    fn test_tag_operator_requires_tag_not_body() {
        let (dir, idx) = indexed_tag_fixture();
        // ideas.md's body contains "project" but only project.md carries the
        // `ideas` TAG. Looking up tag:ideas must NOT return other.md.
        let (results, _) = idx.search("tag:ideas", 10).unwrap();
        let paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        assert_eq!(paths, vec!["/vault/ideas.md"]);
        let _ = dir;
    }

    #[test]
    fn test_tag_operator_ands_with_fulltext() {
        let (dir, idx) = indexed_tag_fixture();
        let (results, _) = idx.search("tag:project plan", 10).unwrap();
        let paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        assert_eq!(paths, vec!["/vault/project.md"]);
        let _ = dir;
    }

    #[test]
    fn test_tag_operator_multiple_tags_are_and() {
        let (dir, idx) = indexed_tag_fixture();
        let (results, _) = idx.search("tag:project tag:ideas", 10).unwrap();
        let paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        assert_eq!(paths, vec!["/vault/ideas.md"]);
        let _ = dir;
    }

    #[test]
    fn test_tag_operator_prefix_and_case() {
        let (dir, idx) = indexed_tag_fixture();
        let (results, _) = idx.search("TAG:Proj", 10).unwrap();
        let mut paths: Vec<&str> = results.iter().map(|r| r.path.as_str()).collect();
        paths.sort_unstable();
        assert_eq!(paths, vec!["/vault/ideas.md", "/vault/project.md"]);
        let _ = dir;
    }

    #[test]
    fn test_single_char_query_no_prefix_explosion() {
        let dir = tempdir().unwrap();
        let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        idx.update_document(
            "/vault/note1.md",
            "note1",
            "A fast runner and an apple.",
            "a",
        )
        .unwrap();
        idx.update_document(
            "/vault/note2.md",
            "note2",
            "Another person entirely.",
            "b",
        )
        .unwrap();
        idx.commit().unwrap();

        // Single-character word query "a" should match exact "a", not prefix-expand to "another", "apple", "and".
        let (results, _) = idx.search("a", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "/vault/note1.md");
    }

    #[test]
    fn test_segment_corruption_auto_recovery() {
        let dir = tempdir().unwrap();
        {
            let mut idx = TantivyIndex::open_or_create(dir.path()).unwrap();
            idx.update_document("/vault/initial.md", "initial", "Initial text", "")
                .unwrap();
            idx.commit().unwrap();
        }

        // Simulate file corruption: overwrite files in dir with random/garbage bytes.
        for entry in std::fs::read_dir(dir.path()).unwrap().flatten() {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                let _ = std::fs::write(entry.path(), b"GARBAGE_CORRUPTED_BYTES_HERE");
            }
        }

        // Reopening should catch corruption, wipe directory, and create a fresh healthy index.
        let mut recovered_idx = TantivyIndex::open_or_create(dir.path()).unwrap();
        assert_eq!(recovered_idx.doc_count(), 0);

        // Verify index is fully functional after recovery.
        recovered_idx
            .update_document("/vault/new.md", "new", "Fresh content after recovery", "")
            .unwrap();
        recovered_idx.commit().unwrap();

        let (results, total) = recovered_idx.search("fresh", 10).unwrap();
        assert_eq!(total, 1);
        assert_eq!(results[0].path, "/vault/new.md");
    }
}
