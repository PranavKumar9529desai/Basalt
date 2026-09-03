use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum MarkdownNode {
    Heading(u8, Vec<MarkdownNode>),
    Text(String),
    Paragraph(Vec<MarkdownNode>),
    List(Vec<MarkdownNode>),
    ListItem(Vec<MarkdownNode>),
    WikiLink {
        target: String,
        alias: Option<String>,
        hash: Option<String>, // covers '#' header links or '^' block refs
    },
    Embed {
        target: String,
        alias: Option<String>,
        hash: Option<String>,
    },
    Tag(String),
    Code(String),
    CodeBlock(String, String), // language, code
    Blockquote(Vec<MarkdownNode>),
    Rule,
    // Raw HTML preserved as opaque text (ADR-026). The string is never rendered
    // from the AST — it only feeds metadata extraction (links/tags). HTML is
    // sanitized at the render boundary in the frontend, never here.
    HtmlBlock(String),
    HtmlInline(String),
    // Add more as needed
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
pub struct Document {
    pub frontmatter: Option<serde_yaml_ng::Value>,
    pub ast: Vec<MarkdownNode>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
}

impl Document {
    pub fn new() -> Self {
        Self::default()
    }
}
