use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct FileMetadata {
    pub frontmatter: Option<serde_yaml_ng::Value>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
}

impl FileMetadata {
    pub fn new() -> Self {
        Self {
            frontmatter: None,
            tags: Vec::new(),
            links: Vec::new(),
        }
    }
}

/// A highly optimized, zero-AST parser that only extracts metadata (frontmatter, tags, links)
/// Used by `basalt_fs` to quickly index thousands of files without memory bloat.
pub fn extract_metadata(input: &str) -> FileMetadata {
    let mut meta = FileMetadata::new();
    let mut content_to_scan = input;

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
                content_to_scan = &input[after_frontmatter..];
            } else {
                content_to_scan = "";
            }
        }
    }

    // 2. Fast scan for Links and Tags without full Markdown parsing
    let bytes = content_to_scan.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            // Check for Wikilink [[...]]
            b'[' if i + 1 < bytes.len() && bytes[i + 1] == b'[' => {
                i += 2;
                let start = i;
                while i < bytes.len() && !(bytes[i] == b']' && i + 1 < bytes.len() && bytes[i + 1] == b']') {
                    i += 1;
                }
                if i < bytes.len() {
                    let link_content = &content_to_scan[start..i];
                    
                    // Parse target from [[Target|Alias]] or [[Target#Header]]
                    let target = link_content.split('|').next().unwrap_or("").split('#').next().unwrap_or("").trim();
                    if !target.is_empty() {
                        meta.links.push(target.to_string());
                    }
                    i += 2; // Skip ]]
                }
            }
            // Check for Tags #...
            b'#' => {
                // Must be at start of line or after whitespace to be a valid tag
                let valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
                
                i += 1;
                let start = i;
                
                if valid_start {
                    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-' || bytes[i] > 127) {
                        i += 1;
                    }
                    if i > start {
                        let tag = &content_to_scan[start..i];
                        meta.tags.push(tag.to_string());
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
        let input = "---\ntitle: Test\n---\nHere is a #tag and a [[Link|Alias]] formatting.";
        let meta = extract_metadata(input);
        
        assert!(meta.frontmatter.is_some());
        assert_eq!(meta.tags, vec!["tag"]);
        assert_eq!(meta.links, vec!["Link"]);
    }
}
