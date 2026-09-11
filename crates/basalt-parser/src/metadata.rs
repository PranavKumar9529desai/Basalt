use crate::task_scan::{is_task_checkbox, scan_task_line, scan_task_line_unicode};
use crate::utf16::SpanCursor;
use basalt_types::{FileMetadata, Span};

/// Extract and parse YAML frontmatter between `---` fences.
///
/// Returns the number of bytes to skip from `input` to reach the body
/// (past any trailing newline), or 0 if no frontmatter is present.
fn parse_frontmatter(input: &str, meta: &mut FileMetadata) -> usize {
    let (open_end, close_start) = match crate::frontmatter::fm_bounds(input) {
        Some(bounds) => bounds,
        None => return 0,
    };
    let frontmatter_str = &input[open_end..close_start];

    let yaml = match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(frontmatter_str) {
        Ok(v) => v,
        Err(_) => return 0,
    };
    meta.frontmatter = Some(yaml);

    // Make frontmatter properties first-class: extract wikilinks /
    // tags / aliases declared inside the block so they reach the
    // graph, backlinks and search index (ADR-022 rule 1).
    if let Some(fm) = &meta.frontmatter {
        let mut fm_links: Vec<String> = Vec::new();
        let mut fm_tags: Vec<String> = Vec::new();
        let mut fm_aliases: Vec<String> = Vec::new();
        crate::frontmatter::walk_fm(fm, &mut fm_links, &mut fm_tags, &mut fm_aliases);

        meta.links.extend(fm_links);
        meta.tags.extend(fm_tags);
        meta.aliases.extend(fm_aliases);
    }

    crate::frontmatter::frontmatter_body_offset(input)
}

#[inline]
pub fn extract_target(link_content: &str) -> &str {
    link_content.split(['|', '#']).next().unwrap_or("").trim()
}

#[inline]
fn find_closing_brackets(bytes: &[u8], from: usize) -> Option<usize> {
    let mut search_from = from;
    while search_from < bytes.len() {
        let rel = memchr::memchr(b']', &bytes[search_from..])?;
        let found = search_from + rel;
        if found + 1 < bytes.len() && bytes[found + 1] == b']' {
            return Some(found);
        }
        search_from = found + 1;
    }
    None
}

// ---------------------------------------------------------------------------
// Tier 1: Pure ASCII Fast Path (0 conversions, 0 allocations, O(1) spans)
// ---------------------------------------------------------------------------

#[inline]
fn scan_wikilink_or_embed_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    if i + 1 >= bytes.len() || bytes[i + 1] != b'[' {
        return None;
    }

    let is_embed = i > 0 && bytes[i - 1] == b'!';
    let start_byte = if is_embed { i - 1 } else { i };
    let content_start = i + 2;

    let close_i = find_closing_brackets(bytes, content_start)?;
    let end_byte = close_i + 2;

    let link_content = input.get(content_start..close_i).unwrap_or("");
    let target = extract_target(link_content);

    if !target.is_empty() {
        let span = Span {
            start: start_byte,
            end: end_byte,
        };
        if is_embed {
            meta.embeds.push(target.to_string());
            meta.embed_locations.push((target.to_string(), span));
        } else {
            meta.links.push(target.to_string());
            meta.link_locations.push((target.to_string(), span));
        }
    }

    Some(end_byte)
}

#[inline]
fn scan_block_id_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if !is_valid_start {
        return None;
    }

    let start_byte = i;
    let start = i + 1;
    let mut end = start;

    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-') {
        end += 1;
    }

    if end > start {
        let block_id = input.get(start..end).unwrap_or("");
        meta.block_ids.push((
            block_id.to_string(),
            Span {
                start: start_byte,
                end,
            },
        ));
        Some(end)
    } else {
        None
    }
}

#[inline]
fn scan_heading_or_tag_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_line_start = i == 0 || bytes[i - 1] == b'\n' || bytes[i - 1] == b'\r';
    if is_line_start {
        let mut level = 1;
        let mut temp_i = i + 1;
        while temp_i < bytes.len() && bytes[temp_i] == b'#' {
            level += 1;
            temp_i += 1;
        }
        if temp_i < bytes.len() && bytes[temp_i] == b' ' {
            let start_byte = i;
            temp_i += 1;
            let text_start = temp_i;
            let end_heading = match memchr::memchr(b'\n', &bytes[temp_i..]) {
                Some(rel) => temp_i + rel,
                None => bytes.len(),
            };
            let text_content = input
                .get(text_start..end_heading)
                .unwrap_or("")
                .trim()
                .to_string();

            meta.headings.push((
                level as u8,
                text_content,
                Span {
                    start: start_byte,
                    end: end_heading,
                },
            ));
            return Some(end_heading);
        }
    }

    let valid_tag_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if valid_tag_start {
        let start_byte = i;
        let start = i + 1;
        let mut end = start;

        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_' || bytes[end] == b'-')
        {
            end += 1;
        }

        if end > start {
            let tag = input.get(start..end).unwrap_or("");
            let is_all_numbers = tag.bytes().all(|b| b.is_ascii_digit());
            let is_hex_color =
                (tag.len() == 3 || tag.len() == 4 || tag.len() == 6 || tag.len() == 8)
                    && tag.bytes().all(|b| b.is_ascii_hexdigit());

            if !tag.is_empty() && !is_all_numbers && !is_hex_color {
                meta.tags.push(tag.to_string());
                meta.tag_locations.push((
                    tag.to_string(),
                    Span {
                        start: start_byte,
                        end,
                    },
                ));
            }
            return Some(end);
        }
    }

    None
}

fn scan_body_tokens_ascii(input: &str, start: usize, meta: &mut FileMetadata) {
    let bytes = input.as_bytes();
    let mut i = start;

    while i < bytes.len() {
        let rel = match memchr::memchr3(b'[', b'^', b'#', &bytes[i..]) {
            Some(r) => r,
            None => break,
        };
        i += rel;

        match bytes[i] {
            b'[' => {
                // Checkbox list item (`- [ ]`, `* [ ]`, `1. [ ]`; indented or
                // behind `>` prefixes). Checked before wikilinks so a task
                // line is consumed whole: the checkbox bracket is not a link,
                // and inner [[wikilinks]] stay part of the task description.
                if is_task_checkbox(bytes, i) {
                    if let Some(next_i) = scan_task_line(input, bytes, i, meta) {
                        i = next_i;
                        continue;
                    }
                }
                if let Some(next_i) = scan_wikilink_or_embed_ascii(input, bytes, i, meta) {
                    i = next_i;
                    continue;
                }
            }
            b'^' => {
                if let Some(next_i) = scan_block_id_ascii(input, bytes, i, meta) {
                    i = next_i;
                    continue;
                }
            }
            b'#' => {
                if let Some(next_i) = scan_heading_or_tag_ascii(input, bytes, i, meta) {
                    i = next_i;
                    continue;
                }
            }
            _ => unreachable!(),
        }
        i += 1;
    }
}

// ---------------------------------------------------------------------------
// Tier 2: Streaming Dual-Cursor Fallback (0 allocations, CodeMirror UTF-16)
// ---------------------------------------------------------------------------

#[inline]
fn scan_wikilink_or_embed_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    if i + 1 >= bytes.len() || bytes[i + 1] != b'[' {
        return None;
    }

    let is_embed = i > 0 && bytes[i - 1] == b'!';
    let content_start = i + 2;

    let close_i = find_closing_brackets(bytes, content_start)?;
    let end_byte = close_i + 2;

    let link_content = input.get(content_start..close_i).unwrap_or("");
    let target = extract_target(link_content);

    if !target.is_empty() {
        cursor.advance_to(i, input);
        let u16_start = if is_embed {
            cursor.utf16_idx - 1
        } else {
            cursor.utf16_idx
        };
        cursor.advance_to(end_byte, input);
        let u16_end = cursor.utf16_idx;

        let span = Span {
            start: u16_start,
            end: u16_end,
        };
        if is_embed {
            meta.embeds.push(target.to_string());
            meta.embed_locations.push((target.to_string(), span));
        } else {
            meta.links.push(target.to_string());
            meta.link_locations.push((target.to_string(), span));
        }
    } else {
        cursor.advance_to(end_byte, input);
    }

    Some(end_byte)
}

#[inline]
fn scan_block_id_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if !is_valid_start {
        return None;
    }

    let start_byte = i;
    let start = i + 1;
    let mut end = start;

    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-') {
        end += 1;
    }

    if end > start {
        let block_id = input.get(start..end).unwrap_or("");
        cursor.advance_to(start_byte, input);
        let u16_start = cursor.utf16_idx;
        let delta = end - start_byte; // block IDs are strictly ASCII
        let u16_end = u16_start + delta;
        cursor.byte_idx = end;
        cursor.utf16_idx = u16_end;

        meta.block_ids.push((
            block_id.to_string(),
            Span {
                start: u16_start,
                end: u16_end,
            },
        ));
        Some(end)
    } else {
        None
    }
}

#[inline]
fn scan_heading_or_tag_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_line_start = i == 0 || bytes[i - 1] == b'\n' || bytes[i - 1] == b'\r';
    if is_line_start {
        let mut level = 1;
        let mut temp_i = i + 1;
        while temp_i < bytes.len() && bytes[temp_i] == b'#' {
            level += 1;
            temp_i += 1;
        }
        if temp_i < bytes.len() && bytes[temp_i] == b' ' {
            let start_byte = i;
            temp_i += 1;
            let text_start = temp_i;
            let end_heading = match memchr::memchr(b'\n', &bytes[temp_i..]) {
                Some(rel) => temp_i + rel,
                None => bytes.len(),
            };
            let text_content = input
                .get(text_start..end_heading)
                .unwrap_or("")
                .trim()
                .to_string();

            cursor.advance_to(start_byte, input);
            let u16_start = cursor.utf16_idx;
            cursor.advance_to(end_heading, input);
            let u16_end = cursor.utf16_idx;

            meta.headings.push((
                level as u8,
                text_content,
                Span {
                    start: u16_start,
                    end: u16_end,
                },
            ));
            return Some(end_heading);
        }
    }

    let valid_tag_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if valid_tag_start {
        let start_byte = i;
        let start = i + 1;
        let mut end = start;

        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric()
                || bytes[end] == b'_'
                || bytes[end] == b'-'
                || bytes[end] > 127)
        {
            end += 1;
        }

        if end > start {
            let tag = input.get(start..end).unwrap_or("");
            let is_all_numbers = tag.chars().all(|c| c.is_ascii_digit());
            let is_hex_color =
                (tag.len() == 3 || tag.len() == 4 || tag.len() == 6 || tag.len() == 8)
                    && tag.chars().all(|c| c.is_ascii_hexdigit());

            if !tag.is_empty() && !is_all_numbers && !is_hex_color {
                meta.tags.push(tag.to_string());
                cursor.advance_to(start_byte, input);
                let u16_start = cursor.utf16_idx;
                cursor.advance_to(end, input);
                let u16_end = cursor.utf16_idx;

                meta.tag_locations.push((
                    tag.to_string(),
                    Span {
                        start: u16_start,
                        end: u16_end,
                    },
                ));
            } else {
                cursor.advance_to(end, input);
            }
            return Some(end);
        }
    }

    None
}

fn scan_body_tokens_unicode(input: &str, start: usize, meta: &mut FileMetadata) {
    let bytes = input.as_bytes();
    let mut i = start;
    let mut cursor = SpanCursor::new();

    while i < bytes.len() {
        let rel = match memchr::memchr3(b'[', b'^', b'#', &bytes[i..]) {
            Some(r) => r,
            None => break,
        };
        i += rel;

        match bytes[i] {
            b'[' => {
                // Checkbox list item (`- [ ]`, `* [ ]`, `1. [ ]`; indented or
                // behind `>` prefixes). Checked before wikilinks so a task
                // line is consumed whole; see scan_body_tokens_ascii.
                if is_task_checkbox(bytes, i) {
                    if let Some(next_i) = scan_task_line_unicode(input, bytes, i, &mut cursor, meta)
                    {
                        i = next_i;
                        continue;
                    }
                }
                if let Some(next_i) =
                    scan_wikilink_or_embed_unicode(input, bytes, i, &mut cursor, meta)
                {
                    i = next_i;
                    continue;
                }
            }
            b'^' => {
                if let Some(next_i) = scan_block_id_unicode(input, bytes, i, &mut cursor, meta) {
                    i = next_i;
                    continue;
                }
            }
            b'#' => {
                if let Some(next_i) =
                    scan_heading_or_tag_unicode(input, bytes, i, &mut cursor, meta)
                {
                    i = next_i;
                    continue;
                }
            }
            _ => unreachable!(),
        }
        i += 1;
    }
}

/// Scan the markdown body for links, embeds, tags, headings, and block IDs,
/// populating `meta` in place.
fn scan_body_tokens(input: &str, start: usize, meta: &mut FileMetadata) {
    if input.is_ascii() {
        scan_body_tokens_ascii(input, start, meta);
    } else {
        scan_body_tokens_unicode(input, start, meta);
    }
}

/// A highly optimized, zero-AST parser that only extracts metadata (frontmatter, tags, links)
/// Used by `basalt_vault` to quickly index thousands of files without memory bloat.
pub fn extract_metadata(input: &str) -> FileMetadata {
    let mut meta = FileMetadata::new();
    let body_start = parse_frontmatter(input, &mut meta);
    scan_body_tokens(input, body_start, &mut meta);
    meta.links.sort_unstable();
    meta.links.dedup();
    meta.tags.sort_unstable();
    meta.tags.dedup();
    meta
}

#[cfg(test)]
mod tests {
    use super::extract_metadata;
    use basalt_types::Span;

    #[test]
    fn test_extract_metadata() {
        let input = "---\ntitle: Test\n---\n# My Heading\nHere is a #tag and a [[Link|Alias]] formatting. ^block-1";
        let meta = extract_metadata(input);

        assert!(meta.frontmatter.is_some());
        assert_eq!(meta.tags, vec!["tag"]);
        assert_eq!(meta.links, vec!["Link"]);

        // Verify Locations
        assert_eq!(meta.headings.len(), 1);
        assert_eq!(meta.headings[0].0, 1);
        assert_eq!(meta.headings[0].1, "My Heading");

        // Ensure UTF-16 span exists
        assert!(meta.headings[0].2.end > meta.headings[0].2.start);
        assert_eq!(meta.tag_locations.len(), 1);
        assert_eq!(meta.link_locations.len(), 1);
        assert!(meta.embeds.is_empty());
    }

    #[test]
    fn test_extract_embeds_and_links() {
        let input = "Here is a [[Link|Alias]] and an ![[image.png]] embed.\nAlso ![[docs/diagram.pdf|Diagram]] and ![[audio.mp3]].";
        let meta = extract_metadata(input);

        assert_eq!(meta.links, vec!["Link"]);
        assert_eq!(
            meta.embeds,
            vec!["image.png", "docs/diagram.pdf", "audio.mp3"]
        );

        assert_eq!(meta.link_locations.len(), 1);
        assert_eq!(meta.embed_locations.len(), 3);
        assert_eq!(meta.embed_locations[0].0, "image.png");
        assert_eq!(meta.embed_locations[1].0, "docs/diagram.pdf");
        assert_eq!(meta.embed_locations[2].0, "audio.mp3");
    }

    #[test]
    fn test_extract_metadata_emoji_zwj_and_surrogates() {
        // "🚀" = 4 bytes UTF-8, 2 code units UTF-16
        // "👨‍👩‍👧‍👦" = 25 bytes UTF-8, 11 code units UTF-16
        let input = "Intro 🚀 rocket and family 👨‍👩‍👧‍👦 end.\n# Heading 1\nSee [[Target]] and #tag.";
        let meta = extract_metadata(input);

        assert_eq!(meta.links, vec!["Target"]);
        assert_eq!(meta.tags, vec!["tag"]);
        assert_eq!(meta.headings.len(), 1);

        // Verify heading span in UTF-16:
        // "Intro " (6) + "🚀" (2) + " rocket and family " (19) + "👨‍👩‍👧‍👦" (11) + " end.\n" (6) = 44 UTF-16 code units
        let h_span = &meta.headings[0].2;
        assert_eq!(h_span.start, 44);
        assert_eq!(h_span.end, 55);

        // Verify link span:
        // After "# Heading 1\n" (+12 -> 56):
        // "See " (+4 -> 60):
        // "[[Target]]" starts at 60, ends at 70 (len 10)
        let l_span = &meta.link_locations[0].1;
        assert_eq!(l_span.start, 60);
        assert_eq!(l_span.end, 70);

        // Verify tag span:
        // " and " (+5 -> 75):
        // "#tag" starts at 75, ends at 79 (len 4)
        let t_span = &meta.tag_locations[0].1;
        assert_eq!(t_span.start, 75);
        assert_eq!(t_span.end, 79);
    }

    #[test]
    fn test_extract_metadata_cjk() {
        let input = "# ノートのタイトル\n本文テキスト。[[リンク先|表示名]]を参照。 #重要タグ";
        let meta = extract_metadata(input);

        assert_eq!(meta.headings.len(), 1);
        assert_eq!(meta.headings[0].1, "ノートのタイトル");
        assert_eq!(meta.links, vec!["リンク先"]);
        assert_eq!(meta.tags, vec!["重要タグ"]);

        // In UTF-16:
        // "# ノートのタイトル\n" = 1 (#) + 1 ( ) + 8 (ノートのタイトル) + 1 (\n) = 11 code units
        // "本文テキスト。" = 7 code units
        // "[[リンク先|表示名]]" starts at 11 + 7 = 18
        // Content: "[[" (2) + "リンク先" (4) + "|" (1) + "表示名" (3) + "]]" (2) = 12 code units -> ends at 30
        let l_span = &meta.link_locations[0].1;
        assert_eq!(l_span, &Span { start: 18, end: 30 });

        // "を参照。 " = 5 code units -> 35
        // "#重要タグ" starts at 35, ends at 40
        let t_span = &meta.tag_locations[0].1;
        assert_eq!(t_span, &Span { start: 35, end: 40 });
    }

    #[test]
    fn test_deduplication_in_place() {
        let input = "---\ntags: [apple, banana]\n---\n# Notes\nHere is #banana and #cherry, with [[Note1]] and [[Note2]].\nAgain [[Note1]]!";
        let meta = extract_metadata(input);

        // Sorted and unique:
        assert_eq!(meta.tags, vec!["apple", "banana", "cherry"]);
        assert_eq!(meta.links, vec!["Note1", "Note2"]);

        // Locations preserved for all occurrences:
        assert_eq!(meta.link_locations.len(), 3);
        assert_eq!(meta.link_locations[0].0, "Note1");
        assert_eq!(meta.link_locations[1].0, "Note2");
        assert_eq!(meta.link_locations[2].0, "Note1");
    }
}
