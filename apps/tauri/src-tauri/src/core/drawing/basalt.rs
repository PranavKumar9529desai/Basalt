//! Basalt's native hybrid drawing format (`.drawing.md`):
//! frontmatter + `# Drawing Text & Elements` + `%%#drawing-data ... %%`.

use super::EMPTY_DRAWING_JSON;

#[derive(Debug)]
pub(crate) struct ParsedBasaltDrawing {
    /// Scene JSON extracted from the `%%#drawing-data ... %%` block.
    pub data_json: String,
    /// Bullet lines from the `# Drawing Text & Elements` section.
    pub text_elements: Vec<String>,
}

/// True when content uses Basalt's native hybrid layout.
pub(crate) fn is_basalt_hybrid(content: &str) -> bool {
    content.contains("%%#drawing-data") || content.contains("# Drawing Text & Elements")
}

/// Parse a Basalt hybrid drawing file. `body` is the content past frontmatter.
pub(crate) fn parse_basalt_hybrid(content: &str, body: &str) -> ParsedBasaltDrawing {
    ParsedBasaltDrawing {
        data_json: extract_scene_json(content),
        text_elements: extract_text_elements(body),
    }
}

/// Extract the scene JSON from a `%%#drawing-data ... %%` block.
fn extract_scene_json(content: &str) -> String {
    let Some(start_tag) = content.find("%%#drawing-data") else {
        return EMPTY_DRAWING_JSON.to_string();
    };
    let json_start = start_tag + "%%#drawing-data".len();
    let rest = &content[json_start..];
    let Some(end_tag) = rest.find("%%") else {
        return EMPTY_DRAWING_JSON.to_string();
    };
    let extracted = rest[..end_tag].trim().to_string();
    if extracted.is_empty() {
        EMPTY_DRAWING_JSON.to_string()
    } else {
        extracted
    }
}

/// Extract bullet lines from the `# Drawing Text & Elements` section.
fn extract_text_elements(body: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut in_text_section = false;

    for line in body.lines() {
        let t = line.trim();
        if t.starts_with("%%") {
            break;
        }
        if t == "# Drawing Text & Elements" {
            in_text_section = true;
            continue;
        }
        if in_text_section {
            if t.starts_with('#') {
                break;
            }
            if let Some(item) = t.strip_prefix('-') {
                let val = item.trim();
                if !val.is_empty() {
                    result.push(val.to_string());
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basalt_hybrid_parse() {
        let content = "---\ntype: excalidraw\nversion: 2\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-02T00:00:00Z\n---\n# Drawing Text & Elements\n- [[Node]]\n\n%%#drawing-data\n{\"type\":\"excalidraw\",\"version\":2,\"elements\":[{\"type\":\"text\",\"text\":\"x\",\"isDeleted\":false}],\"appState\":{},\"files\":{}}\n%%\n";

        let parsed = parse_basalt_hybrid(content, &content[content.find("# Drawing").unwrap()..]);
        assert!(parsed.data_json.contains("\"elements\""));
        assert_eq!(parsed.text_elements, vec!["[[Node]]".to_string()]);
    }

    #[test]
    fn test_basalt_hybrid_empty_block_uses_empty_scene() {
        let content = "%%#drawing-data\n\n%%\n";
        let parsed = parse_basalt_hybrid(content, content);
        assert_eq!(parsed.data_json, EMPTY_DRAWING_JSON);
    }
}