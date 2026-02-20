use crate::types::MarkdownNode;

pub fn parse_inline_text(mut input: &str) -> Vec<MarkdownNode> {
    let mut nodes = Vec::new();

    while !input.is_empty() {
        let link_idx = input.find("[[");
        let tag_idx = input.find('#');

        match (link_idx, tag_idx) {
            (Some(l), Some(t)) => {
                if l < t {
                    input = handle_link(input, l, &mut nodes);
                } else {
                    input = handle_tag(input, t, &mut nodes);
                }
            }
            (Some(l), None) => {
                 input = handle_link(input, l, &mut nodes);
            }
            (None, Some(t)) => {
                 input = handle_tag(input, t, &mut nodes);
            }
            (None, None) => {
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
        if l > 0 { nodes.push(MarkdownNode::Text(input[..l].to_string())); }
        nodes.push(MarkdownNode::WikiLink(input[l + 2..l + 2 + end].to_string()));
        &input[l + 4 + end..]
    } else {
        nodes.push(MarkdownNode::Text(input[..l+2].to_string()));
        &input[l+2..]
    }
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
        if t > 0 { nodes.push(MarkdownNode::Text(input[..t].to_string())); }
        nodes.push(MarkdownNode::Tag(input[tag_start..tag_start + tag_len].to_string()));
        &input[tag_start + tag_len..]
    } else {
        // Just treat # as text
        nodes.push(MarkdownNode::Text(input[..tag_start + tag_len].to_string()));
        &input[tag_start + tag_len..]
    }
}
