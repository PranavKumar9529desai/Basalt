pub mod frontmatter;
pub mod metadata;
pub mod node;
pub mod search;

pub use frontmatter::{
    FrontmatterDiagnostic, FrontmatterDiagnosticKind, FrontmatterEntry, FrontmatterModel,
    FrontmatterValue, PropertyType,
};
pub use metadata::{FileMetadata, Span};
pub use node::{Document, MarkdownNode};
pub use search::{ContextLine, FileMatch, FileResult, Highlight, LineMatch, SearchContentResult};
pub mod query;

pub use query::{yaml_to_typed, yaml_to_typed_pairs, QueryColumn, QueryResult, TypedValue};
