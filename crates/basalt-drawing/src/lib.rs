//! Drawing file format — parse and serialize `.excalidraw.md` and raw
//! `.excalidraw` files in the Obsidian Excalidraw plugin's shell.
//!
//! Implements:
//! - **Obsidian Excalidraw plugin** (`.excalidraw.md`): `# Excalidraw Data`
//!   with a `## Drawing` scene block — plain `json` or LZString
//!   `compressed-json`. Basalt always writes plain `json`.
//! - **Raw Excalidraw JSON** (`.excalidraw`): direct JSON scene file.
//! - **Legacy Basalt hybrid** (`.drawing.md`, read-only): frontmatter +
//!   `%%#drawing-data`; never written, migrated to the shell on save.
//!
//! The crate is self-contained: no Tauri, no business state.

mod basalt;
pub mod obsidian;

pub use obsidian::create_drawing_file;
pub use obsidian::serialize_obsidian_markdown;

use std::collections::HashSet;
use std::io::Write;
use std::path::Path;

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

/// Serialize a scene into the Obsidian Excalidraw shell, choosing the writer
/// by what exists on disk:
/// - no existing file → a brand-new shell file ([`create_drawing_file`])
/// - existing Obsidian-shell file → surgical in-place update
///   ([`serialize_obsidian_markdown`]: only the `## Drawing` block changes)
/// - existing legacy Basalt hybrid (`.drawing.md`) → migrated to a clean
///   shell, preserving the original `created` timestamp
pub fn serialize_drawing_content(data_json: &str, existing_markdown: Option<&str>) -> String {
    match existing_markdown {
        None => obsidian::create_drawing_file(data_json),
        Some(existing) if obsidian::is_obsidian_excalidraw_format(existing) => {
            obsidian::serialize_obsidian_markdown(data_json, existing)
        }
        Some(existing) => migrate_legacy_basalt(data_json, existing),
    }
}

/// Rebuild a legacy Basalt hybrid (`.drawing.md` / `%%#drawing-data`) as a
/// clean Obsidian shell. Legacy sections are dropped wholesale; only the
/// original `created` timestamp is carried over.
fn migrate_legacy_basalt(data_json: &str, existing: &str) -> String {
    let (created, _, _) = parse_frontmatter(existing);
    obsidian::create_drawing_file_with_created(data_json, created)
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
    fn test_round_trip_create_parse_shell() {
        let json = r##"{"type":"excalidraw","version":2,"source":"basalt","elements":[{"type":"text","id":"t1","text":"[[Node]]","isDeleted":false}],"appState":{"viewBackgroundColor":"transparent"},"files":{}}"##;

        let serialized = create_drawing_file(json);
        assert!(serialized.contains("excalidraw-plugin: parsed"));
        assert!(serialized.contains("tags: [excalidraw]"));
        assert!(serialized.contains("basalt:"));
        assert!(serialized.contains("# Excalidraw Data"));
        assert!(serialized.contains("## Text Elements"));
        assert!(serialized.contains("[[Node]] ^t1"));
        assert!(serialized.contains("## Drawing"));
        assert!(serialized.contains("```json"));

        let parsed = parse_drawing_content(&serialized);
        assert_eq!(parsed.data_json.trim(), json.trim());
        assert_eq!(parsed.text_elements, vec!["[[Node]]".to_string()]);
        assert!(parsed.created.is_some());
        assert!(parsed.updated.is_some());
    }

    #[test]
    fn test_legacy_hybrid_migrates_to_shell() {
        let legacy = "---\ntype: excalidraw\nversion: 2\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-02T00:00:00Z\n---\n# Drawing Text & Elements\n- [[Node]]\n\n%%#drawing-data\n{\"type\":\"excalidraw\",\"version\":2,\"elements\":[{\"type\":\"text\",\"text\":\"x\",\"isDeleted\":false}],\"appState\":{},\"files\":{}}\n%%\n";
        let json = r##"{"type":"excalidraw","version":2,"elements":[{"type":"text","text":"migrated","isDeleted":false}],"appState":{},"files":{}}"##;

        let out = serialize_drawing_content(&json, Some(legacy));

        // Legacy sections are dropped in favour of a clean Obsidian shell.
        assert!(!out.contains("# Drawing Text & Elements"));
        assert!(!out.contains("%%#drawing-data"));
        assert!(!out.contains("type: excalidraw"));
        assert!(out.contains("excalidraw-plugin: parsed"));
        assert!(out.contains("# Excalidraw Data"));
        assert!(out.contains("## Drawing"));
        // The original created timestamp survives the migration.
        assert!(out.contains("created: 2026-01-01T00:00:00Z"));
    }

    #[test]
    fn test_missing_file_creates_fresh_shell() {
        let json = r##"{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}"##;
        let out = serialize_drawing_content(&json, None);
        assert!(out.starts_with("---\nexcalidraw-plugin: parsed\n"));
        assert!(out.contains("## Drawing\n```json\n"));
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
