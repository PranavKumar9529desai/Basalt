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
            .match_kind(aho_corasick::MatchKind::LeftmostLongest)
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

        // SIMD fast filter: skips non-matching lines with zero allocations.
        if !ac.is_match(line) {
            continue;
        }

        // Compute raw character highlight ranges.
        // For pure ASCII lines, byte offsets are identically equal to character offsets.
        let mut raw_highlights: Vec<Highlight> = if line.is_ascii() {
            ac.find_iter(line)
                .map(|m| Highlight {
                    start: m.start(),
                    end: m.end(),
                })
                .collect()
        } else {
            let char_byte: Vec<usize> = line.char_indices().map(|(b, _)| b).collect();
            let byte_to_char = |b: usize| -> usize { char_byte.partition_point(|&cb| cb < b) };
            ac.find_iter(line)
                .map(|m| Highlight {
                    start: byte_to_char(m.start()),
                    end: byte_to_char(m.end()),
                })
                .collect()
        };

        if raw_highlights.is_empty() {
            continue;
        }

        // Edge-Case 1: Overlapping Highlight Interval Merging.
        raw_highlights.sort_unstable_by_key(|h| h.start);
        let mut merged: Vec<Highlight> = Vec::with_capacity(raw_highlights.len());
        for h in raw_highlights {
            if let Some(last) = merged.last_mut() {
                if h.start <= last.end {
                    last.end = last.end.max(h.end);
                    continue;
                }
            }
            merged.push(h);
        }

        // Edge-Case 2: Mega-Line Preview Clamping.
        // Clamp preview lines longer than 250 characters around match bounds.
        let total_chars = if line.is_ascii() {
            line.len()
        } else {
            line.chars().count()
        };

        let (text, highlights) = if total_chars <= 250 {
            (line.to_string(), merged)
        } else {
            let first_start = merged[0].start;
            let last_end = merged.last().unwrap().end;

            let start_char = first_start.saturating_sub(100);
            let mut end_char = (last_end + 150).min(total_chars);
            if end_char.saturating_sub(start_char) > 250 {
                end_char = (first_start + 150).min(total_chars);
            }

            let prefix = if start_char > 0 { "..." } else { "" };
            let suffix = if end_char < total_chars { "..." } else { "" };

            let slice_str: String = if line.is_ascii() {
                line[start_char..end_char].to_string()
            } else {
                line.chars()
                    .skip(start_char)
                    .take(end_char - start_char)
                    .collect()
            };

            let clamped_text = format!("{prefix}{slice_str}{suffix}");
            let shift = prefix.chars().count();

            let shifted_highlights: Vec<Highlight> = merged
                .into_iter()
                .filter(|h| h.start >= start_char && h.end <= end_char)
                .map(|h| Highlight {
                    start: (h.start - start_char) + shift,
                    end: (h.end - start_char) + shift,
                })
                .collect();

            (clamped_text, shifted_highlights)
        };

        let line_no = idx + 1;
        let start = idx.saturating_sub(context_lines);
        let context_before: Vec<ContextLine> = (start..idx)
            .map(|i| {
                let l = lines[i];
                let ctx_text = if l.len() > 250 {
                    if l.is_ascii() {
                        format!("{}...", &l[..250])
                    } else {
                        format!("{}...", l.chars().take(250).collect::<String>())
                    }
                } else {
                    l.to_string()
                };
                ContextLine {
                    line_number: i + 1,
                    text: ctx_text,
                }
            })
            .collect();

        let end = (idx + 1 + context_lines).min(lines.len());
        let context_after: Vec<ContextLine> = ((idx + 1)..end)
            .map(|i| {
                let l = lines[i];
                let ctx_text = if l.len() > 250 {
                    if l.is_ascii() {
                        format!("{}...", &l[..250])
                    } else {
                        format!("{}...", l.chars().take(250).collect::<String>())
                    }
                } else {
                    l.to_string()
                };
                ContextLine {
                    line_number: i + 1,
                    text: ctx_text,
                }
            })
            .collect();

        out.push(LineMatch {
            line_number: line_no,
            text,
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

    #[test]
    fn test_overlapping_highlights_merged() {
        let body = "The car carpet is red.";
        let m = TermMatcher::new(&["car", "carpet"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 0);
        assert_eq!(matches.len(), 1);
        // "car" at 4..7 and "carpet" at 8..14
        // If query is "car" and "carpet", in "carpet" both "car" (8..11) and "carpet" (8..14) match.
        // They must be merged into one highlight [8..14].
        let carpets: Vec<_> = matches[0]
            .highlights
            .iter()
            .map(|h| char_sub(&matches[0].text, h.start, h.end))
            .collect();
        assert_eq!(carpets, vec!["car", "carpet"]);
    }

    #[test]
    fn test_overlapping_prefix_substring_merged() {
        let body = "carpet";
        let m = TermMatcher::new(&["car", "carpet"]).unwrap();
        let matches = extract_file_matches(body, &m, 5, 0);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].highlights.len(), 1, "overlapping 'car' and 'carpet' must merge into one");
        let h = &matches[0].highlights[0];
        assert_eq!(char_sub(&matches[0].text, h.start, h.end), "carpet");
    }

    #[test]
    fn test_mega_line_clamping() {
        // Construct a 600-character line with "TARGET" at character 300.
        let prefix_fill = "a".repeat(300);
        let suffix_fill = "b".repeat(300);
        let body = format!("{prefix_fill}TARGET{suffix_fill}");
        let m = TermMatcher::new(&["target"]).unwrap();
        let matches = extract_file_matches(&body, &m, 5, 0);
        assert_eq!(matches.len(), 1);
        let match_item = &matches[0];
        assert!(match_item.text.starts_with("..."));
        assert!(match_item.text.ends_with("..."));
        assert!(match_item.text.len() <= 260);
        assert_eq!(match_item.highlights.len(), 1);
        let h = &match_item.highlights[0];
        assert_eq!(char_sub(&match_item.text, h.start, h.end), "TARGET");
    }

    #[test]
    fn test_simd_fast_filter_skips_lines() {
        let mut lines = Vec::new();
        for i in 0..500 {
            lines.push(format!("This is regular line {i} without the query."));
        }
        lines.push("This line has the special keyword NEEDLE in it.".to_string());
        for i in 501..1000 {
            lines.push(format!("This is trailing line {i} without anything."));
        }
        let body = lines.join("\n");
        let m = TermMatcher::new(&["needle"]).unwrap();
        let matches = extract_file_matches(&body, &m, 5, 1);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 501);
        let h = &matches[0].highlights[0];
        assert_eq!(char_sub(&matches[0].text, h.start, h.end), "NEEDLE");
    }
}
