use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde_yaml_ng;

use crate::types::{Document, MarkdownNode};
use crate::inline::parse_inline_text;

pub fn parse_markdown(input: &str) -> Document {
    let mut doc = Document::new();
    let mut markdown_content = input;

    // 1. Extract Frontmatter
    if input.starts_with("---\n") || input.starts_with("---\r\n") {
        let end_idx = input[4..].find("\n---").map(|i| i + 4);
        if let Some(idx) = end_idx {
            let frontmatter_str = &input[4..idx];
            if let Ok(yaml) = serde_yaml_ng::from_str::<serde_yaml_ng::Value>(frontmatter_str) {
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
    
    let mut stack: Vec<MarkdownNode> = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => stack.push(MarkdownNode::Paragraph(Vec::new())),
                Tag::Heading { level, .. } => stack.push(MarkdownNode::Heading(level as u8, Vec::new())),
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
                         MarkdownNode::Heading(_, ref mut children) |
                         MarkdownNode::Paragraph(ref mut children) |
                         MarkdownNode::ListItem(ref mut children) |
                         MarkdownNode::Blockquote(ref mut children) => {
                             children.push(MarkdownNode::Text(current_text));
                         }
                         MarkdownNode::CodeBlock(_, ref mut code) => code.push_str(&current_text),
                         _ => {} 
                     }
                 } else {
                     doc.ast.push(MarkdownNode::Text(current_text));
                 }
            },
            Event::Code(text) => {
                if let Some(parent) = stack.last_mut() {
                    match parent {
                        MarkdownNode::Heading(_, ref mut children) |
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

    // Pass 2: Process inline elements (WikiLinks, Tags) within block nodes.
    // We only process MarkdownNode::Text elements, and we consolidate them first.
    let mut final_ast = Vec::new();
    for mut root_node in doc.ast {
         process_node(&mut root_node, &mut doc.tags, &mut doc.links);
         final_ast.push(root_node);
    }
    doc.ast = final_ast;

    doc
}

fn process_node(node: &mut MarkdownNode, tags: &mut Vec<String>, links: &mut Vec<String>) {
    match node {
        MarkdownNode::Paragraph(children) |
        MarkdownNode::Heading(_, children) |
        MarkdownNode::ListItem(children) |
        MarkdownNode::Blockquote(children) => {
            *children = process_children(std::mem::take(children), tags, links);
        }
        MarkdownNode::List(children) => {
            for child in children {
                process_node(child, tags, links);
            }
        }
        _ => {}
    }
}

fn process_children(children: Vec<MarkdownNode>, tags: &mut Vec<String>, links: &mut Vec<String>) -> Vec<MarkdownNode> {
    // Phase 1: Consolidate adjacent Text nodes (because pulldown-cmark fragments things like `[` and `]`)
    let mut consolidated: Vec<MarkdownNode> = Vec::new();
    for child in children {
        if let MarkdownNode::Text(t_new) = &child {
            if let Some(MarkdownNode::Text(t_old)) = consolidated.last_mut() {
                t_old.push_str(t_new);
                continue;
            }
        }
        consolidated.push(child);
    }
    
    // Phase 2: Run robust inline parser over the consolidated Text nodes
    let mut final_children = Vec::new();
    for mut child in consolidated {
        if let MarkdownNode::Text(txt) = child {
            let inline_nodes = crate::inline::parse_inline_text(&txt);
            for inline_node in &inline_nodes {
                 match inline_node {
                     MarkdownNode::Tag(t) => tags.push(t.clone()),
                     MarkdownNode::WikiLink { target, .. } => links.push(target.clone()),
                     MarkdownNode::Embed { target, .. } => links.push(target.clone()),
                     _ => {}
                 }
            }
            final_children.extend(inline_nodes);
        } else {
            // Recurse into nested structures (like Lists inside Blockquotes) just in case
            process_node(&mut child, tags, links);
            final_children.push(child);
        }
    }
    final_children
}
