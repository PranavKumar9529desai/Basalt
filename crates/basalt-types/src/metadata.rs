use serde::{Deserialize, Serialize};

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
    /// Embed targets (`![[image.png]]`). Separate from `links` (`[[Note]]`)
    /// so consumers can distinguish a note reference from a media embed.
    pub embeds: Vec<String>,
    /// Property names declared as `aliases:` in frontmatter (Obsidian alternate
    /// note names). Extracted from the parsed YAML so the app can surface them.
    pub aliases: Vec<String>,

    // UI tracking data uses UTF-16 code unit offsets for CodeMirror
    pub tag_locations: Vec<(String, Span)>,
    pub link_locations: Vec<(String, Span)>,
    pub embed_locations: Vec<(String, Span)>,
    pub headings: Vec<(u8, String, Span)>,
    pub block_ids: Vec<(String, Span)>,
}

impl FileMetadata {
    pub fn new() -> Self {
        Self {
            frontmatter: None,
            tags: Vec::new(),
            links: Vec::new(),
            embeds: Vec::new(),
            aliases: Vec::new(),
            tag_locations: Vec::new(),
            link_locations: Vec::new(),
            embed_locations: Vec::new(),
            headings: Vec::new(),
            block_ids: Vec::new(),
        }
    }
}
