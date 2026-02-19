use pulldown_cmark::{Parser, Options, html};
use serde::{Serialize, Deserialize};

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
    
    ProcessedMarkdown {
        html: html_output,
    }
}
