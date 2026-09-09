pub mod frontmatter;
pub mod inline;
pub mod link_rewrite;
pub mod metadata;
pub mod query;

pub mod parser;
pub mod utf16;

pub use frontmatter::parse_frontmatter;
pub use link_rewrite::{
    normalize_target, rewrite_wikilinks, rewrite_wikilinks_path, scan_wikilinks, NoteRename,
    PathRename, WikilinkSpec,
};
pub use metadata::extract_metadata;
pub use parser::{process_markdown, ProcessedMarkdown};
pub use query::{parse_query, ParseError};
pub use utf16::{SpanCursor, TextDocument};
