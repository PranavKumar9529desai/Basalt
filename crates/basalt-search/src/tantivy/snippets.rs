use aho_corasick::AhoCorasick;

use basalt_types::{ContextLine, Highlight, LineMatch};

/// A case-insensitive multi-term matcher, built once per query and reused
/// across every document so the automaton isn't rebuilt per doc (ADR-030 §2.5).
#[derive(Clone)]
pub struct TermMatcher {
    ac: AhoCorasick,
}

impl TermMatcher {
    /// Build from the query terms. Returns `None` if empty or unbuildable.
    pub fn new(query_terms: &[&str]) -> Option<TermMatcher> {
        if query_terms.is_empty() {
            return None;
        }
        AhoCorasick::builder()
            .ascii_case_insensitive(true)
            .build(query_terms)
            .ok()
            .map(|ac| TermMatcher { ac })
    }
}

/// Build up to `max_matches` line-level matches by scanning `body` for the
/// terms in `matcher`.
///
/// Every line containing a term becomes a [`LineMatch`] with the term positions
/// marked in `highlights` (character offsets within the line) and up to
/// `context_lines` surrounding lines captured in `context_before` / `context_after`.
/// This is the data the LazyVim-style preview pane needs: the matched line plus
/// the text around it, so the reader sees the term in context without opening the file.
pub fn extract_file_matches(
    body: &str,
    matcher: &TermMatcher,
    max_matches: usize,
    context_lines: usize,
) -> Vec<LineMatch> {
    if body.is_empty() {
        return vec![];
    }

    let ac = &matcher.ac;

    // Split on '\n', stripping a single trailing '\r' so CRLF files behave.
    let lines: Vec<&str> = body
        .split('\n')
        .map(|l| {
            if let Some(stripped) = l.strip_suffix('\r') {
                stripped
            } else {
                l
            }
        })
        .collect();

    let mut out = Vec::new();
    for (idx, line) in lines.iter().enumerate() {
        if out.len() >= max_matches {
            break;
        }
        // Map each byte boundary to its character index for highlight ranges.
        // AhoCorasick returns byte ranges; `m.start()`/`m.end()` land on char
        // boundaries, so find the exact char index of that byte. The byte
        // offsets are strictly increasing, so binary search (partition_point)
        // beats a linear scan — O(log n) per lookup (ADR-030 §2.5).
        let char_byte: Vec<usize> = line.char_indices().map(|(b, _)| b).collect();
        let byte_to_char = |b: usize| -> usize { char_byte.partition_point(|&cb| cb < b) };
        let hits: Vec<(usize, usize)> = ac.find_iter(line).map(|m| (m.start(), m.end())).collect();
        if hits.is_empty() {
            continue;
        }

        let highlights: Vec<Highlight> = hits
            .iter()
            .map(|&(s, e)| Highlight {
                start: byte_to_char(s),
                end: byte_to_char(e),
            })
            .collect();

        let line_no = idx + 1;
        let start = idx.saturating_sub(context_lines);
        let context_before: Vec<ContextLine> = (start..idx)
            .map(|i| ContextLine {
                line_number: i + 1,
                text: lines[i].to_string(),
            })
            .collect();
        let end = (idx + 1 + context_lines).min(lines.len());
        let context_after: Vec<ContextLine> = ((idx + 1)..end)
            .map(|i| ContextLine {
                line_number: i + 1,
                text: lines[i].to_string(),
            })
            .collect();

        out.push(LineMatch {
            line_number: line_no,
            text: line.to_string(),
            highlights,
            context_before,
            context_after,
        });
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Slice `s` by character (not byte) offsets — mirrors how the JS frontend
    /// calls `String.prototype.slice`, and is the contract `highlights` use.
    fn char_sub(s: &str, start: usize, end: usize) -> String {
        s.chars().skip(start).take(end - start).collect()
    }

    #[test]
    fn test_single_term_one_match() {
        let body = "The quick brown fox jumps over the lazy dog. Rust is fast.";
        let m = TermMatcher::new(&["rust"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 2);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 1);
        assert_eq!(matches[0].highlights.len(), 1);
        let h = &matches[0].highlights[0];
        assert_eq!(char_sub(&matches[0].text, h.start, h.end), "Rust");
    }

    #[test]
    fn test_two_terms_in_one_line_two_highlights() {
        let body = "We need to install some packages on this machine.";
        let m = TermMatcher::new(&["some", "pack"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 2);
        assert_eq!(matches.len(), 1, "both terms share one line → one match");
        assert_eq!(matches[0].highlights.len(), 2, "both terms highlighted");
    }

    #[test]
    fn test_context_lines_captured() {
        let body = "a\nb\nTARGET\nc\nd\ne";
        let m = TermMatcher::new(&["target"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 2);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 3);
        assert_eq!(matches[0].context_before.len(), 2);
        assert_eq!(matches[0].context_before[0].line_number, 1);
        assert_eq!(matches[0].context_before[1].text, "b");
        assert_eq!(matches[0].context_after.len(), 2);
        assert_eq!(matches[0].context_after[0].text, "c");
        assert_eq!(matches[0].context_after[1].line_number, 5);
    }

    #[test]
    fn test_max_matches_respected() {
        let body = "a x a x a x a x a x";
        let m = TermMatcher::new(&["x"]).unwrap();
        let matches = extract_file_matches(body, &m, 2, 1);
        assert!(matches.len() <= 2);
    }

    #[test]
    fn test_empty_inputs() {
        let m = TermMatcher::new(&["rust"]).unwrap();
        assert!(extract_file_matches("", &m, 5, 2).is_empty());
        assert!(extract_file_matches("hello world", &m, 5, 2).is_empty());
        assert!(TermMatcher::new(&[]).is_none());
    }

    #[test]
    fn test_multi_byte_highlight_offsets_are_char_based() {
        // "Rust" is preceded by a 2-byte char (é). The byte offset of 'R' would be 6,
        // but the char offset must be 5 so the JS frontend slices it correctly.
        let body = "café Rust";
        let m = TermMatcher::new(&["rust"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 0);
        assert_eq!(matches.len(), 1);
        let h = &matches[0].highlights[0];
        assert_eq!(char_sub(&matches[0].text, h.start, h.end), "Rust");
    }
}
