pub mod inline;
pub mod metadata;
pub mod parser;
pub mod utf16;

pub use metadata::extract_metadata;
pub use parser::{parse_markdown, process_markdown, ProcessedMarkdown};
pub use utf16::TextDocument;
