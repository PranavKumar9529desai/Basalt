//! Drawing file format — parse and serialize `.drawing.md`, `.excalidraw.md`,
//! and raw `.excalidraw` files.
//!
//! Implements three format variants:
//! - **Basalt hybrid** (`.drawing.md`): frontmatter + `%%#drawing-data` + text elements
//! - **Obsidian Excalidraw plugin** (`.excalidraw.md`): `# Excalidraw Data` with compressed scene blocks
//! - **Raw Excalidraw JSON** (`.excalidraw`): direct JSON scene file
//!
//! The crate is self-contained: no Tauri, no business state.

mod basalt;
pub mod obsidian;

use std::collections::HashSet;
use std::io::Write;
use std::path::Path;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

/// Structured payload returned by [`parse_drawing_content`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DrawingPayload {
    /// Raw JSON scene string — either the hybrid file's embedded scene or the
    /// direct `.excalidraw` JSON (decompressed when the source was compressed).
    pub data_json: String,
    /// Extracted plain-text lines from the drawing elements for markdown search/graph indexing.
    pub text_elements: Vec<String>,
    /// Full raw markdown content of the file.
    pub raw_markdown: String,
    /// ISO-8601 created timestamp from frontmatter if present.
    pub created: Option<String>,
    /// ISO-8601 updated timestamp from frontmatter if present.
    pub updated: Option<String>,
}

/// Fallback empty Excalidraw scene JSON. The canvas is transparent so the
/// editor surface colour shows through (see apps/tauri drawing lib/scene.ts).
pub const EMPTY_DRAWING_JSON: &str = r##"{"type":"excalidraw","version":2,"source":"basalt","elements":[],"appState":{"viewBackgroundColor":"transparent","gridSize":20},"files":{}}"##;

/// Extract non-empty text values from active (non-deleted) text elements in an Excalidraw JSON payload.
pub fn extract_text_elements_from_json(data_json: &str) -> Vec<String> {
    let Ok(val) = serde_json::from_str::<serde_json::Value>(data_json) else {
        return Vec::new();
    };

    let Some(elements) = val.get("elements").and_then(|e| e.as_array()) else {
        return Vec::new();
    };

    let mut result = Vec::new();
    let mut seen = HashSet::new();

    for elem in elements {
        let is_deleted = elem
            .get("isDeleted")
            .and_then(|d| d.as_bool())
            .unwrap_or(false);
        if is_deleted {
            continue;
        }

        if let Some(text_str) = elem.get("text").and_then(|t| t.as_str()) {
            for line in text_str.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && seen.insert(trimmed.to_string()) {
                    result.push(trimmed.to_string());
                }
            }
        }
    }

    result
}

/// Parse YAML frontmatter for `created:`/`updated:` timestamps.
/// Returns `(created, updated, body_start)` where `body_start` is the byte offset
/// just past the closing frontmatter fence (0 when no frontmatter is present).
fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>, usize) {
    let trimmed_start = content.trim_start();
    if !trimmed_start.starts_with("---") {
        return (None, None, 0);
    }

    let after_first_fence = &content[3..];
    let Some(second_fence_idx) = after_first_fence.find("\n---") else {
        return (None, None, 0);
    };

    let mut created = None;
    let mut updated = None;

    for line in after_first_fence[..second_fence_idx].lines() {
        let line_trim = line.trim();
        if let Some(rest) = line_trim.strip_prefix("created:") {
            created = Some(
                rest.trim()
                    .trim_matches('\'')
                    .trim_matches('\"')
                    .to_string(),
            );
        } else if let Some(rest) = line_trim.strip_prefix("updated:") {
            updated = Some(
                rest.trim()
                    .trim_matches('\'')
                    .trim_matches('\"')
                    .to_string(),
            );
        }
    }

    let mut body_start = 3 + second_fence_idx + 4;
    if body_start < content.len() && content.as_bytes()[body_start] == b'\n' {
        body_start += 1;
    }

    (created, updated, body_start)
}

/// Parse a drawing file's string content (either hybrid `.drawing.md`, an
/// Obsidian Excalidraw plugin `.excalidraw.md`, or raw `.excalidraw` JSON).
pub fn parse_drawing_content(content: &str) -> DrawingPayload {
    let trimmed_start = content.trim_start();
    if trimmed_start.starts_with('{') {
        // Pure Excalidraw JSON file (.excalidraw)
        let text_elements = extract_text_elements_from_json(content);
        return DrawingPayload {
            data_json: content.to_string(),
            text_elements,
            raw_markdown: content.to_string(),
            created: None,
            updated: None,
        };
    }

    let (created, updated, body_start) = parse_frontmatter(content);
    let body = if body_start < content.len() {
        &content[body_start..]
    } else {
        ""
    };

    // Basalt's native hybrid (`.drawing.md`): `%%#drawing-data` + `# Drawing Text & Elements`.
    if basalt::is_basalt_hybrid(content) {
        let parsed = basalt::parse_basalt_hybrid(content, body);
        let text_elements = if parsed.text_elements.is_empty() {
            extract_text_elements_from_json(&parsed.data_json)
        } else {
            parsed.text_elements
        };
        return DrawingPayload {
            data_json: parsed.data_json,
            text_elements,
            raw_markdown: content.to_string(),
            created,
            updated,
        };
    }

    // Obsidian Excalidraw plugin hybrid (`.excalidraw.md`): `# Excalidraw Data` +
    // fenced `## Drawing` scene block (plain or LZString-compressed).
    if obsidian::is_obsidian_excalidraw_format(content) {
        let parsed = obsidian::parse_obsidian_excalidraw(content);
        let data_json = parsed
            .data_json
            .unwrap_or_else(|| EMPTY_DRAWING_JSON.to_string());
        let text_elements = if parsed.text_elements.is_empty() {
            extract_text_elements_from_json(&data_json)
        } else {
            parsed.text_elements
        };
        return DrawingPayload {
            data_json,
            text_elements,
            raw_markdown: content.to_string(),
            created,
            updated,
        };
    }

    DrawingPayload {
        data_json: EMPTY_DRAWING_JSON.to_string(),
        text_elements: Vec::new(),
        raw_markdown: content.to_string(),
        created,
        updated,
    }
}

/// Serializes drawing data and element texts into the hybrid `.drawing.md` Markdown backplane.
pub fn serialize_drawing_markdown(
    data_json: &str,
    existing_markdown: Option<&str>,
) -> Result<String, String> {
    let text_elements = extract_text_elements_from_json(data_json);
    let now_iso = Utc::now().to_rfc3339();

    let mut created = now_iso.clone();
    let mut custom_frontmatter_lines: Vec<&str> = Vec::new();

    if let Some(existing) = existing_markdown {
        let trimmed = existing.trim_start();
        if trimmed.starts_with("---") {
            let after_first_fence = &existing[3..];
            if let Some(second_fence_idx) = after_first_fence.find("\n---") {
                for line in after_first_fence[..second_fence_idx].lines() {
                    let line_trim = line.trim();
                    if let Some(rest) = line_trim.strip_prefix("created:") {
                        let val = rest
                            .trim()
                            .trim_matches('\'')
                            .trim_matches('\"')
                            .to_string();
                        if !val.is_empty() {
                            created = val;
                        }
                    } else if !line_trim.starts_with("updated:")
                        && !line_trim.starts_with("type:")
                        && !line_trim.starts_with("version:")
                        && !line_trim.is_empty()
                    {
                        custom_frontmatter_lines.push(line);
                    }
                }
            }
        }
    }

    let mut out = String::new();
    out.push_str("---\n");
    out.push_str("type: excalidraw\n");
    out.push_str("version: 2\n");
    out.push_str(&format!("created: {created}\n"));
    out.push_str(&format!("updated: {now_iso}\n"));
    for custom in &custom_frontmatter_lines {
        out.push_str(custom);
        out.push('\n');
    }
    out.push_str("---\n\n");
    out.push_str("# Drawing Text & Elements\n\n");

    if text_elements.is_empty() {
        out.push('\n');
    } else {
        for text in &text_elements {
            out.push_str(&format!("- {text}\n"));
        }
        out.push('\n');
    }

    out.push_str("%%#drawing-data\n");
    out.push_str(data_json.trim());
    out.push_str("\n%%\n");

    Ok(out)
}

/// Atomically write content to disk via a temporary file in the same directory,
/// preventing file corruption or partial writes.
pub fn atomic_write_file(path: &Path, content: &str) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    if !parent.exists() {
        std::fs::create_dir_all(parent)?;
    }

    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(content.as_bytes())?;
    temp.flush()?;
    temp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_text_elements() {
        let json = r#"{
            "type": "excalidraw",
            "version": 2,
            "elements": [
                {"type": "rectangle", "id": "1", "isDeleted": false},
                {"type": "text", "id": "2", "text": "[[System Architecture]]", "isDeleted": false},
                {"type": "text", "id": "3", "text": "Load Balancer\nWorker Pool", "isDeleted": false},
                {"type": "text", "id": "4", "text": "Old Deleted Text", "isDeleted": true}
            ]
        }"#;

        let texts = extract_text_elements_from_json(json);
        assert_eq!(
            texts,
            vec![
                "[[System Architecture]]".to_string(),
                "Load Balancer".to_string(),
                "Worker Pool".to_string()
            ]
        );
    }

    #[test]
    fn test_round_trip_parse_and_serialize() {
        let json = r##"{"type":"excalidraw","version":2,"source":"basalt","elements":[{"type":"text","id":"t1","text":"[[Node]]","isDeleted":false}],"appState":{"viewBackgroundColor":"transparent"},"files":{}}"##;

        let serialized = serialize_drawing_markdown(json, None).expect("serialization failed");
        assert!(serialized.contains("type: excalidraw"));
        assert!(serialized.contains("version: 2"));
        assert!(serialized.contains("# Drawing Text & Elements"));
        assert!(serialized.contains("- [[Node]]"));
        assert!(serialized.contains("%%#drawing-data"));

        let parsed = parse_drawing_content(&serialized);
        assert_eq!(parsed.data_json.trim(), json.trim());
        assert_eq!(parsed.text_elements, vec!["[[Node]]".to_string()]);
        assert!(parsed.created.is_some());
        assert!(parsed.updated.is_some());
    }

    #[test]
    fn test_raw_excalidraw_json_parsing() {
        let json = r#"{"type":"excalidraw","version":2,"elements":[{"type":"text","text":"Hello World","isDeleted":false}]}"#;
        let parsed = parse_drawing_content(json);
        assert_eq!(parsed.data_json, json);
        assert_eq!(parsed.text_elements, vec!["Hello World".to_string()]);
    }

    #[test]
    fn test_atomic_write_file() {
        let dir = tempfile::tempdir().expect("tempdir failed");
        let file_path = dir.path().join("test.drawing.md");
        let content = "# Test Drawing\n";

        atomic_write_file(&file_path, content).expect("atomic write failed");
        let read_back = std::fs::read_to_string(&file_path).expect("read failed");
        assert_eq!(read_back, content);
    }
}
