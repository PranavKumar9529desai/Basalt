use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum MarkdownNode {
    Heading(u8, Vec<MarkdownNode>),
    Text(String),
    Paragraph(Vec<MarkdownNode>),
    List(Vec<MarkdownNode>),
    ListItem(Vec<MarkdownNode>),
    WikiLink(String),
    Tag(String),
    Code(String),
    CodeBlock(String, String), // language, code
    Blockquote(Vec<MarkdownNode>),
    Rule,
    // Add more as needed
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Document {
    pub frontmatter: Option<serde_yaml::Value>,
    pub ast: Vec<MarkdownNode>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
}

impl Document {
    pub fn new() -> Self {
        Self {
            frontmatter: None,
            ast: Vec::new(),
            tags: Vec::new(),
            links: Vec::new(),
        }
    }
}
