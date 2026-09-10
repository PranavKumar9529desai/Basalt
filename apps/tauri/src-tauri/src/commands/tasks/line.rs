//! Task line parsing: checkbox syntax + IPC result shapes (ADR-048).

use serde::Serialize;

use super::signifiers::{is_signifier_token, parse_signifiers_from_desc, ParsedSignifiers};

/// Result of reading a task line.
#[derive(Serialize)]
pub struct TaskLineResult {
    /// The full raw line text.
    pub raw: String,
    /// Checkbox status character: 'x', ' ', '-', '>', etc.
    pub status_char: char,
    /// Description text (without signifiers).
    pub description: String,
    /// Parsed signifiers.
    pub signifiers: TaskSignifiers,
}

/// Parsed signifiers from a task line.
#[derive(Serialize, Default)]
pub struct TaskSignifiers {
    pub priority: Option<String>,
    pub due: Option<String>,
    pub scheduled: Option<String>,
    pub start: Option<String>,
    pub created: Option<String>,
    pub recurrence: Option<String>,
    pub tags: Vec<String>,
}

/// Parse a checkbox line: returns (before_bracket, status_char, after_bracket).
pub(super) fn parse_checkbox_line(line: &str) -> Option<(&str, char, &str)> {
    let bracket_start = line.find("[")?;
    let bracket_end = line.find("]")?;
    if bracket_end <= bracket_start + 1 {
        return None;
    }
    let status_char = line.as_bytes()[bracket_start + 1] as char;
    let before = &line[..bracket_start + 1]; // includes "["
    let after = &line[bracket_end..]; // includes "]"
    Some((before, status_char, after))
}

/// Parse a checkbox line into (indent, status_char, description, signifiers).
///
/// The description is the text before the first signifier token — signifiers
/// are leaf suffixes in the canonical layout, so a prefill/edit round-trip
/// never duplicates them.
pub(super) fn parse_task_line_parts(
    line: &str,
) -> Option<(&str, char, String, ParsedSignifiers<'_>)> {
    // Match: optional indent + "- [" + status_char + "] " + rest
    let trimmed_start = line.len() - line.trim_start().len();
    let indent = &line[..trimmed_start];

    let rest = &line[trimmed_start..];
    let dash_pos = rest.find("- [")?;
    let after_dash = &rest[dash_pos + 3..];
    let bracket_end = after_dash.find(']')?;
    let status_char = after_dash.chars().next()?;
    let after_bracket = &after_dash[bracket_end + 1..];

    // Strip leading space after bracket
    let raw_desc = after_bracket.trim_start();

    // Parse signifiers from the raw description text
    let sigs = parse_signifiers_from_desc(raw_desc);

    // Description = everything before the first signifier token.
    let description = raw_desc
        .split_whitespace()
        .take_while(|t| !is_signifier_token(t))
        .collect::<Vec<_>>()
        .join(" ");

    Some((indent, status_char, description, sigs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_checkbox_line_with_indent() {
        let (before, status_char, after) = parse_checkbox_line("  - [x] done 🔺").unwrap();
        assert_eq!(before, "  - [");
        assert_eq!(status_char, 'x');
        assert_eq!(after, "] done 🔺");
    }

    #[test]
    fn task_line_description_strips_signifiers() {
        let line = "- [ ] Ship release ⏫ 📅2024-02-01 ⏳2024-01-25 🛫2024-01-20 🔁every 2 weeks #release";
        let (indent, status_char, desc, sigs) = parse_task_line_parts(line).unwrap();
        assert_eq!(indent, "");
        assert_eq!(status_char, ' ');
        assert_eq!(desc, "Ship release");
        assert_eq!(sigs.priority, Some("high"));
        assert_eq!(sigs.due, Some("2024-02-01"));
        assert_eq!(sigs.scheduled, Some("2024-01-25"));
        assert_eq!(sigs.start, Some("2024-01-20"));
        assert_eq!(sigs.recurrence, Some("every 2 weeks"));
        assert_eq!(sigs.tags, vec!["#release"]);
    }

    #[test]
    fn task_line_without_signifiers_keeps_full_description() {
        let (_, _, desc, sigs) =
            parse_task_line_parts("- [ ] Just a plain task").unwrap();
        assert_eq!(desc, "Just a plain task");
        assert!(sigs.tags.is_empty());
        assert_eq!(sigs.priority, None);
    }
}