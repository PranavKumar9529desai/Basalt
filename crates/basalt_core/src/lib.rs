pub mod arena;
pub mod graph;
pub mod inline;
pub mod markdown_parser;
pub mod metadata;
pub mod types;
pub mod utf16_mapper;

pub use arena::StringArena;
pub use graph::NoteGraph;
pub use markdown_parser::parse_markdown;
pub use metadata::{extract_metadata, FileMetadata};
pub use types::{Document, MarkdownNode};
pub use utf16_mapper::TextDocument;

// Existing function retained for testing/compatibility for now
use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct ProcessedMarkdown {
    pub html: String,
}

pub fn process_markdown(input: &str) -> ProcessedMarkdown {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(input, options);

    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    ProcessedMarkdown { html: html_output }
}
