use crate::types::MarkdownNode;
// this is for the Single file obsidian edge case extraction
// like the embed link and tags
pub fn parse_inline_text(mut input: &str) -> Vec<MarkdownNode> {
    let mut nodes = Vec::new();

    while !input.is_empty() {
        let embed_idx = input.find("![[");
        let link_idx = input.find("[[");
        let tag_idx = input.find('#');

        let mut min_idx = input.len();
        let mut token = None;

        if let Some(e) = embed_idx {
            if e < min_idx {
                min_idx = e;
                token = Some("embed");
            }
        }
        if let Some(l) = link_idx {
            if l < min_idx {
                min_idx = l;
                token = Some("link");
            }
        }
        if let Some(t) = tag_idx {
            if t < min_idx {
                min_idx = t;
                token = Some("tag");
            }
        }

        match token {
            Some("embed") => input = handle_embed(input, min_idx, &mut nodes),
            Some("link") => input = handle_link(input, min_idx, &mut nodes),
            Some("tag") => input = handle_tag(input, min_idx, &mut nodes),
            _ => {
                nodes.push(MarkdownNode::Text(input.to_string()));
                break;
            }
        }
    }

    // Consolidate adjacent Text nodes
    let mut consolidated = Vec::new();
    for node in nodes {
        if let MarkdownNode::Text(t1) = &node {
            if let Some(MarkdownNode::Text(t2)) = consolidated.last_mut() {
                t2.push_str(t1);
                continue;
            }
        }
        consolidated.push(node);
    }

    consolidated
}

fn handle_link<'a>(input: &'a str, l: usize, nodes: &mut Vec<MarkdownNode>) -> &'a str {
    if let Some(end) = input[l + 2..].find("]]") {
        if l > 0 {
            nodes.push(MarkdownNode::Text(input[..l].to_string()));
        }
        let content = &input[l + 2..l + 2 + end];
        let (target, alias, hash) = parse_obsidian_link(content);
        nodes.push(MarkdownNode::WikiLink {
            target,
            alias,
            hash,
        });
        &input[l + 4 + end..]
    } else {
        nodes.push(MarkdownNode::Text(input[..l + 2].to_string()));
        &input[l + 2..]
    }
}

fn handle_embed<'a>(input: &'a str, e: usize, nodes: &mut Vec<MarkdownNode>) -> &'a str {
    if let Some(end) = input[e + 3..].find("]]") {
        if e > 0 {
            nodes.push(MarkdownNode::Text(input[..e].to_string()));
        }
        let content = &input[e + 3..e + 3 + end];
        let (target, alias, hash) = parse_obsidian_link(content);
        nodes.push(MarkdownNode::Embed {
            target,
            alias,
            hash,
        });
        &input[e + 5 + end..]
    } else {
        nodes.push(MarkdownNode::Text(input[..e + 3].to_string()));
        &input[e + 3..]
    }
}

fn parse_obsidian_link(content: &str) -> (String, Option<String>, Option<String>) {
    let mut target = content;
    let mut alias = None;
    let mut hash = None;

    if let Some(pipe_idx) = target.find('|') {
        alias = Some(target[pipe_idx + 1..].to_string());
        target = &target[..pipe_idx];
    }

    if let Some(hash_idx) = target.find('#') {
        hash = Some(target[hash_idx + 1..].to_string());
        target = &target[..hash_idx];
    }

    (target.to_string(), alias, hash)
}

fn handle_tag<'a>(input: &'a str, t: usize, nodes: &mut Vec<MarkdownNode>) -> &'a str {
    let tag_start = t + 1;
    let mut tag_len = 0;
    for c in input[tag_start..].chars() {
        if c.is_alphanumeric() || c == '_' || c == '-' {
            tag_len += c.len_utf8();
        } else {
            break;
        }
    }

    // Optionally check if tag is preceded by whitespace or start of string
    let valid_prefix = if t == 0 {
        true
    } else {
        let prefix_char = input[..t].chars().last().unwrap();
        prefix_char.is_whitespace() || prefix_char == '\n'
    };

    if tag_len > 0 && valid_prefix {
        if t > 0 {
            nodes.push(MarkdownNode::Text(input[..t].to_string()));
        }
        nodes.push(MarkdownNode::Tag(
            input[tag_start..tag_start + tag_len].to_string(),
        ));
        &input[tag_start + tag_len..]
    } else {
        // Just treat # as text
        nodes.push(MarkdownNode::Text(input[..tag_start + tag_len].to_string()));
        &input[tag_start + tag_len..]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wiki_link() {
        let input = "[[My Page]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::WikiLink {
                target: "My Page".to_string(),
                alias: None,
                hash: None,
            }
        );
    }

    #[test]
    fn test_parse_wiki_link_with_alias() {
        let input = "[[My Page|Alias Text]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::WikiLink {
                target: "My Page".to_string(),
                alias: Some("Alias Text".to_string()),
                hash: None,
            }
        );
    }

    #[test]
    fn test_parse_wiki_link_with_hash() {
        let input = "[[My Page#Section Header]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::WikiLink {
                target: "My Page".to_string(),
                alias: None,
                hash: Some("Section Header".to_string()),
            }
        );
    }

    #[test]
    fn test_parse_wiki_link_with_hash_and_alias() {
        let input = "[[My Page#Section Header|Alias Text]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::WikiLink {
                target: "My Page".to_string(),
                alias: Some("Alias Text".to_string()),
                hash: Some("Section Header".to_string()),
            }
        );
    }

    #[test]
    fn test_parse_embed() {
        let input = "![[Image.png]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::Embed {
                target: "Image.png".to_string(),
                alias: None,
                hash: None,
            }
        );
    }

    #[test]
    fn test_parse_embed_with_size() {
        let input = "![[Image.png|100x100]]";
        let nodes = parse_inline_text(input);
        assert_eq!(nodes.len(), 1);
        assert_eq!(
            nodes[0],
            MarkdownNode::Embed {
                target: "Image.png".to_string(),
                alias: Some("100x100".to_string()),
                hash: None,
            }
        );
    }
}

// why we need this ? Despite being already have indexed metadata for
