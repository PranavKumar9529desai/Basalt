pub mod frontmatter;
pub mod inline;
pub mod metadata;
pub mod parser;
pub mod utf16;

pub use frontmatter::parse_frontmatter;
pub use metadata::extract_metadata;
pub use parser::{parse_markdown, process_markdown, ProcessedMarkdown};
pub use utf16::TextDocument;
