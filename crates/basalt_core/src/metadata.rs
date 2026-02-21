use serde::{Deserialize, Serialize};
use crate::utf16_mapper::TextDocument;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct FileMetadata {
    pub frontmatter: Option<serde_yaml_ng::Value>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    
    // UI tracking data uses UTF-16 code unit offsets for CodeMirror
    pub tag_locations: Vec<(String, Span)>,
    pub link_locations: Vec<(String, Span)>,
    pub headings: Vec<(u8, String, Span)>,
    pub block_ids: Vec<(String, Span)>,
}

impl FileMetadata {
    pub fn new() -> Self {
        Self {
            frontmatter: None,
            tags: Vec::new(),
            links: Vec::new(),
            tag_locations: Vec::new(),
            link_locations: Vec::new(),
            headings: Vec::new(),
            block_ids: Vec::new(),
        }
    }
}

/// A highly optimized, zero-AST parser that only extracts metadata (frontmatter, tags, links)
/// Used by `basalt_fs` to quickly index thousands of files without memory bloat.
pub fn extract_metadata(input: &str) -> FileMetadata {
    let mut meta = FileMetadata::new();
    let text_doc = TextDocument::new(input);
    let bytes = input.as_bytes();
    let mut i = 0;

    // 1. Extract Frontmatter
    if input.starts_with("---\n") || input.starts_with("---\r\n") {
        if let Some(end_idx) = input[4..].find("\n---") {
            let actual_end = end_idx + 4;
            let frontmatter_str = &input[4..actual_end];
            if let Ok(yaml) = serde_yaml_ng::from_str::<serde_yaml_ng::Value>(frontmatter_str) {
                meta.frontmatter = Some(yaml);
            }
            let after_frontmatter = actual_end + 4;
            if input.len() > after_frontmatter {
                i = after_frontmatter;
                if i < bytes.len() && bytes[i] == b'\n' {
                    i += 1;
                }
            }
        }
    }

    // 2. Fast scan for Links, Tags, Headings, and Block IDs
    while i < bytes.len() {
        match bytes[i] {
            // Wikilink [[...]]
            b'[' if i + 1 < bytes.len() && bytes[i + 1] == b'[' => {
                let start_byte = i;
                i += 2;
                let start = i;
                while i < bytes.len() && !(bytes[i] == b']' && i + 1 < bytes.len() && bytes[i + 1] == b']') {
                    i += 1;
                }
                if i < bytes.len() {
                    let end_byte = i + 2;
                    let link_content = input.get(start..i).unwrap_or("");
                    let target = link_content.split('|').next().unwrap_or("").split('#').next().unwrap_or("").trim();
                    if !target.is_empty() {
                         meta.links.push(target.to_string());
                         let u16_start = text_doc.byte_offset_to_utf16(start_byte).unwrap_or(start_byte);
                         let u16_end = text_doc.byte_offset_to_utf16(end_byte).unwrap_or(end_byte);
                         meta.link_locations.push((target.to_string(), Span { start: u16_start, end: u16_end }));
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
                    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-') {
                        i += 1;
                    }
                    if i > start {
                        let block_id = input.get(start..i).unwrap_or("");
                        let u16_start = text_doc.byte_offset_to_utf16(start_byte).unwrap_or(start_byte);
                        let u16_end = text_doc.byte_offset_to_utf16(i).unwrap_or(i);
                        meta.block_ids.push((block_id.to_string(), Span { start: u16_start, end: u16_end }));
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
                        let text_content = input.get(text_start..temp_i).unwrap_or("").trim().to_string();
                        
                        let u16_start = text_doc.byte_offset_to_utf16(start_byte).unwrap_or(start_byte);
                        let u16_end = text_doc.byte_offset_to_utf16(temp_i).unwrap_or(temp_i); // end index
                        
                        meta.headings.push((level as u8, text_content, Span { start: u16_start, end: u16_end }));
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
                    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-' || bytes[i] > 127) {
                        i += 1;
                    }
                    if i > start {
                        let tag = input.get(start..i).unwrap_or("");
                        if !tag.is_empty() {
                            meta.tags.push(tag.to_string());
                            
                            let u16_start = text_doc.byte_offset_to_utf16(start_byte).unwrap_or(start_byte);
                            let u16_end = text_doc.byte_offset_to_utf16(i).unwrap_or(i);
                            meta.tag_locations.push((tag.to_string(), Span { start: u16_start, end: u16_end }));
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

    meta
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(meta.block_ids.len(), 1);
    }
}
