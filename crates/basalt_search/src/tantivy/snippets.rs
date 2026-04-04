use aho_corasick::AhoCorasick;

use crate::types::{Highlight, Snippet};

/// Build up to `max` highlighted snippets by scanning `body` for `query_terms`.
///
/// Matches are collected in a single pass, then grouped into non-overlapping
/// context windows (±60 chars around each match). Matches that fall inside the
/// same window are merged into one `Snippet` with multiple `Highlight` entries,
/// so searching "some page" correctly highlights *both* words in the same excerpt
/// instead of only the first one found.
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

    // Step 1: collect all match byte ranges in document order.
    let all_matches: Vec<(usize, usize)> =
        ac.find_iter(body).map(|m| (m.start(), m.end())).collect();

    if all_matches.is_empty() {
        return vec![];
    }

    // Step 2: group matches into non-overlapping context windows.
    //
    // For each match compute a ±CONTEXT char window clamped to char boundaries.
    // If the new window overlaps the current cluster's window, extend the cluster.
    // Otherwise close the cluster as a Snippet and start a new one.
    const CONTEXT: usize = 60;

    let mut snippets: Vec<Snippet> = Vec::new();
    let mut cluster_start: usize = 0;
    let mut cluster_end: usize = 0;
    let mut cluster_hits: Vec<(usize, usize)> = Vec::new();

    for (i, &(mstart, mend)) in all_matches.iter().enumerate() {
        let ctx_start = snap_to_char_start(body, mstart.saturating_sub(CONTEXT));
        let ctx_end = snap_to_char_end(body, (mend + CONTEXT).min(body.len()));

        if i == 0 {
            cluster_start = ctx_start;
            cluster_end = ctx_end;
            cluster_hits.push((mstart, mend));
        } else if ctx_start < cluster_end {
            // Overlaps current cluster — extend and accumulate.
            cluster_end = cluster_end.max(ctx_end);
            cluster_hits.push((mstart, mend));
        } else {
            // No overlap — emit the current cluster, start a new one.
            emit_snippet(body, cluster_start, cluster_end, &cluster_hits, &mut snippets);
            if snippets.len() >= max {
                return snippets;
            }
            cluster_start = ctx_start;
            cluster_end = ctx_end;
            cluster_hits.clear();
            cluster_hits.push((mstart, mend));
        }
    }

    // Emit the final cluster.
    if snippets.len() < max {
        emit_snippet(body, cluster_start, cluster_end, &cluster_hits, &mut snippets);
    }

    snippets
}

fn emit_snippet(
    body: &str,
    ctx_start: usize,
    ctx_end: usize,
    hits: &[(usize, usize)],
    out: &mut Vec<Snippet>,
) {
    let text = body[ctx_start..ctx_end].to_string();
    let highlights = hits
        .iter()
        .map(|&(s, e)| Highlight {
            start: s - ctx_start,
            end: e - ctx_start,
        })
        .collect();
    out.push(Snippet { text, highlights });
}

/// Walk backward from `pos` to the nearest char boundary.
fn snap_to_char_start(s: &str, pos: usize) -> usize {
    (0..=pos).rev().find(|&i| s.is_char_boundary(i)).unwrap_or(0)
}

/// Walk forward from `pos` to the nearest char boundary.
fn snap_to_char_end(s: &str, pos: usize) -> usize {
    (pos..=s.len()).find(|&i| s.is_char_boundary(i)).unwrap_or(s.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_term_one_snippet() {
        let body = "The quick brown fox jumps over the lazy dog. Rust is fast.";
        let snippets = extract_snippets(body, &["rust"], 2);
        assert_eq!(snippets.len(), 1);
        assert!(snippets[0].text.to_lowercase().contains("rust"));
        assert_eq!(snippets[0].highlights.len(), 1);
    }

    #[test]
    fn test_two_adjacent_terms_merged_into_one_snippet() {
        let body = "We need to install some packages on this machine.";
        // "some" and "pack" both appear close together — must produce ONE snippet
        // with TWO highlights, not two snippets with one highlight each.
        let snippets = extract_snippets(body, &["some", "pack"], 3);
        assert_eq!(snippets.len(), 1, "adjacent matches should merge into one snippet");
        assert_eq!(snippets[0].highlights.len(), 2, "both terms should be highlighted");
    }

    #[test]
    fn test_distant_terms_produce_separate_snippets() {
        // Two matches far apart (more than 2×CONTEXT chars) → two snippets.
        let padding = " ".repeat(200);
        let body = format!("alpha{padding}beta");
        let snippets = extract_snippets(&body, &["alpha", "beta"], 3);
        assert_eq!(snippets.len(), 2);
    }

    #[test]
    fn test_max_limit_respected() {
        let body = "a b a b a b a b a b";
        let snippets = extract_snippets(body, &["a"], 2);
        assert!(snippets.len() <= 2);
    }

    #[test]
    fn test_empty_inputs() {
        assert!(extract_snippets("", &["rust"], 3).is_empty());
        assert!(extract_snippets("hello world", &[], 3).is_empty());
    }
}
