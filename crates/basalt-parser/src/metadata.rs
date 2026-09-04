use crate::utf16::TextDocument;

use basalt_types::{FileMetadata, Span};

/// Extract and parse YAML frontmatter between `---` fences.
///
/// Returns the number of bytes to skip from `input` to reach the body
/// (past any trailing newline), or 0 if no frontmatter is present.
fn parse_frontmatter(input: &str, meta: &mut FileMetadata) -> usize {
    if !input.starts_with("---\n") && !input.starts_with("---\r\n") {
        return 0;
    }
    let end_idx = match input[4..].find("\n---") {
        Some(e) => e,
        None => return 0,
    };
    let actual_end = end_idx + 4;
    let frontmatter_str = &input[4..actual_end];

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
        for l in fm_links {
            if !meta.links.contains(&l) {
                meta.links.push(l);
            }
        }
        for t in fm_tags {
            if !meta.tags.contains(&t) {
                meta.tags.push(t);
            }
        }
        for a in fm_aliases {
            meta.aliases.push(a);
        }
    }

    let after_frontmatter = actual_end + 4;
    if input.len() > after_frontmatter {
        let mut skip = after_frontmatter;
        let bytes = input.as_bytes();
        if skip < bytes.len() && bytes[skip] == b'\n' {
            skip += 1;
        }
        skip
    } else {
        0
    }
}

/// Scan the markdown body for links, embeds, tags, headings, and block IDs,
/// populating `meta` in place.
fn scan_body_tokens(input: &str, start: usize, meta: &mut FileMetadata) {
    let text_doc = TextDocument::new(input);
    let bytes = input.as_bytes();
    let mut i = start;

    while i < bytes.len() {
        match bytes[i] {
            // Wikilink [[...]] or Embed ![[...]]
            b'[' if i + 1 < bytes.len() && bytes[i + 1] == b'[' => {
                let is_embed = i > 0 && bytes[i - 1] == b'!';
                let start_byte = if is_embed { i - 1 } else { i };
                let content_start = i + 2;
                i += 2;
                while i < bytes.len()
                    && !(bytes[i] == b']' && i + 1 < bytes.len() && bytes[i + 1] == b']')
                {
                    i += 1;
                }
                if i < bytes.len() {
                    let end_byte = i + 2;
                    let link_content = input.get(content_start..i).unwrap_or("");
                    let target = link_content
                        .split('|')
                        .next()
                        .unwrap_or("")
                        .split('#')
                        .next()
                        .unwrap_or("")
                        .trim();
                    if !target.is_empty() {
                        let u16_start = text_doc
                            .byte_offset_to_utf16(start_byte)
                            .unwrap_or(start_byte);
                        let u16_end = text_doc.byte_offset_to_utf16(end_byte).unwrap_or(end_byte);
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
                    }
                    i = end_byte; // continue parsing exactly here since we matched it.
                }
            }
            // Block IDs ^...
            b'^' => {
                let is_valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
                let start_byte = i;
                i += 1;
                let start = i;
                if is_valid_start {
                    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-')
                    {
                        i += 1;
                    }
                    if i > start {
                        let block_id = input.get(start..i).unwrap_or("");
                        let u16_start = text_doc
                            .byte_offset_to_utf16(start_byte)
                            .unwrap_or(start_byte);
                        let u16_end = text_doc.byte_offset_to_utf16(i).unwrap_or(i);
                        meta.block_ids.push((
                            block_id.to_string(),
                            Span {
                                start: u16_start,
                                end: u16_end,
                            },
                        ));
                        continue;
                    }
                }
            }
            // Tags or Headings #...
            b'#' => {
                let is_line_start = i == 0 || bytes[i - 1] == b'\n' || bytes[i - 1] == b'\r';

                if is_line_start {
                    let mut level = 1;
                    let mut temp_i = i + 1;
                    while temp_i < bytes.len() && bytes[temp_i] == b'#' {
                        level += 1;
                        temp_i += 1;
                    }
                    if temp_i < bytes.len() && bytes[temp_i] == b' ' {
                        // It's a heading!
                        let start_byte = i;
                        temp_i += 1; // skip space
                        let text_start = temp_i;
                        while temp_i < bytes.len() && bytes[temp_i] != b'\n' {
                            temp_i += 1;
                        }
                        let text_content = input
                            .get(text_start..temp_i)
                            .unwrap_or("")
                            .trim()
                            .to_string();

                        let u16_start = text_doc
                            .byte_offset_to_utf16(start_byte)
                            .unwrap_or(start_byte);
                        let u16_end = text_doc.byte_offset_to_utf16(temp_i).unwrap_or(temp_i); // end index

                        meta.headings.push((
                            level as u8,
                            text_content,
                            Span {
                                start: u16_start,
                                end: u16_end,
                            },
                        ));
                        i = temp_i;
                        continue;
                    }
                }

                // If not a heading, maybe a tag
                let valid_tag_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
                let start_byte = i;
                i += 1; // Skip the '#'
                let start = i;

                if valid_tag_start {
                    while i < bytes.len()
                        && (bytes[i].is_ascii_alphanumeric()
                            || bytes[i] == b'_'
                            || bytes[i] == b'-'
                            || bytes[i] > 127)
                    {
                        i += 1;
                    }
                    if i > start {
                        let tag = input.get(start..i).unwrap_or("");

                        // Obsidian tags cannot consist entirely of numbers
                        let is_all_numbers = tag.chars().all(|c| c.is_ascii_digit());

                        // Extremely common edgecase for zero-AST parsers: CSS hex colors
                        let is_hex_color =
                            (tag.len() == 3 || tag.len() == 4 || tag.len() == 6 || tag.len() == 8)
                                && tag.chars().all(|c| c.is_ascii_hexdigit());

                        if !tag.is_empty() && !is_all_numbers && !is_hex_color {
                            meta.tags.push(tag.to_string());

                            let u16_start = text_doc
                                .byte_offset_to_utf16(start_byte)
                                .unwrap_or(start_byte);
                            let u16_end = text_doc.byte_offset_to_utf16(i).unwrap_or(i);
                            meta.tag_locations.push((
                                tag.to_string(),
                                Span {
                                    start: u16_start,
                                    end: u16_end,
                                },
                            ));
                        }
                        continue;
                    }
                }
            }
            _ => {
                i += 1;
            }
        }
    }
}

/// A highly optimized, zero-AST parser that only extracts metadata (frontmatter, tags, links)
/// Used by `basalt_fs` to quickly index thousands of files without memory bloat.
pub fn extract_metadata(input: &str) -> FileMetadata {
    let mut meta = FileMetadata::new();
    let body_start = parse_frontmatter(input, &mut meta);
    scan_body_tokens(input, body_start, &mut meta);
    meta
}

#[cfg(test)]
mod tests {
    use super::extract_metadata;

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
}
