use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use regex::Regex;
use serde_yaml;

use crate::types::{Document, MarkdownNode};

pub fn parse_markdown(input: &str) -> Document {
    let mut doc = Document::new();
    let mut markdown_content = input;

    // 1. Extract Frontmatter
    if input.starts_with("---\n") || input.starts_with("---\r\n") {
        let end_idx = input[4..].find("\n---").map(|i| i + 4);
        if let Some(idx) = end_idx {
            let frontmatter_str = &input[4..idx];
            if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(frontmatter_str) {
                doc.frontmatter = Some(yaml);
            }
            let after_frontmatter = idx + 4;
            // Skip the newline after `---`
            if input.len() > after_frontmatter {
                if input[after_frontmatter..].starts_with("\r\n") {
                    markdown_content = &input[after_frontmatter + 2..];
                } else if input[after_frontmatter..].starts_with('\n') {
                    markdown_content = &input[after_frontmatter + 1..];
                } else {
                    markdown_content = &input[after_frontmatter..];
                }
            } else {
                markdown_content = "";
            }
        }
    }

    // 2. Parse Markdown
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_TABLES);

    let parser = Parser::new_ext(markdown_content, options);
    
    // Regex for [[WikiLinks]] and #tags
    let link_re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let tag_re = Regex::new(r"#([a-zA-Z0-9_\-]+)").unwrap();
    
    // Process text for tags
    for cap in tag_re.captures_iter(&markdown_content) {
        doc.tags.push(cap[1].to_string());
    }
    
    // Process text for links
    for cap in link_re.captures_iter(&markdown_content) {
        doc.links.push(cap[1].to_string());
    }

    let mut stack: Vec<MarkdownNode> = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => stack.push(MarkdownNode::Paragraph(Vec::new())),
                Tag::Heading { level, .. } => stack.push(MarkdownNode::Heading(level as u8, String::new())),
                Tag::List(_) => stack.push(MarkdownNode::List(Vec::new())),
                Tag::Item => stack.push(MarkdownNode::ListItem(Vec::new())),
                Tag::BlockQuote(_) => stack.push(MarkdownNode::Blockquote(Vec::new())),
                Tag::CodeBlock(kind) => {
                    let lang = match kind {
                        pulldown_cmark::CodeBlockKind::Fenced(l) => l.into_string(),
                        pulldown_cmark::CodeBlockKind::Indented => String::new(),
                    };
                    stack.push(MarkdownNode::CodeBlock(lang, String::new()));
                }
                _ => {} // Ignore intermediate tags for now
            },
            Event::End(tag_end) => {
                 let node = match tag_end {
                      TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::List(_) | TagEnd::Item | TagEnd::BlockQuote(_) | TagEnd::CodeBlock => stack.pop(),
                      _ => None,
                 };
                 
                 if let Some(finished_node) = node {
                      if let Some(parent) = stack.last_mut() {
                          match parent {
                              MarkdownNode::Paragraph(ref mut children) |
                              MarkdownNode::List(ref mut children) |
                              MarkdownNode::ListItem(ref mut children) |
                              MarkdownNode::Blockquote(ref mut children) => {
                                  children.push(finished_node);
                              },
                              _ => {} // Should not happen with valid markdown nesting (mostly)
                          }
                      } else {
                          // Root level
                          doc.ast.push(finished_node);
                      }
                 }
            }
            Event::Text(text) => {
                 let current_text = text.into_string();

                 if let Some(parent) = stack.last_mut() {
                     match parent {
                         MarkdownNode::Heading(_, ref mut s) => s.push_str(&current_text),
                         MarkdownNode::CodeBlock(_, ref mut code) => code.push_str(&current_text),
                         MarkdownNode::Paragraph(ref mut children) |
                         MarkdownNode::ListItem(ref mut children) |
                         MarkdownNode::Blockquote(ref mut children) => {
                             // This is a naive way to handle links/tags inline.
                             // A true parser would split the text node.
                             // For now we just push the raw text node.
                             children.push(MarkdownNode::Text(current_text));
                         }
                         _ => {} 
                     }
                 } else {
                     doc.ast.push(MarkdownNode::Text(current_text));
                 }
            },
            Event::Code(text) => {
                if let Some(parent) = stack.last_mut() {
                    match parent {
                        MarkdownNode::Paragraph(ref mut children) |
                        MarkdownNode::ListItem(ref mut children) |
                        MarkdownNode::Blockquote(ref mut children) => {
                            children.push(MarkdownNode::Code(text.into_string()));
                        },
                        _ => {}
                    }
                } else {
                    doc.ast.push(MarkdownNode::Code(text.into_string()));
                }
            }
            Event::Rule => {
                 doc.ast.push(MarkdownNode::Rule);
            }
            _ => {} // Ignore other events for simplicity now
        }
    }

    doc
}
