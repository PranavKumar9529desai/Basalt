//! Strict task checkbox-line parsing (ADR-048 §2.1).
//!
//! One parser, shared by every authoring path (toggle, create, edit,
//! read-back). Unifies the old loose `parse_checkbox_line` (which matched
//! `foo [x] bar`) and the old `parse_task_line_parts` into a single
//! definition that mirrors `basalt-parser::task_scan::is_task_checkbox`:
//! the list marker must start the line (indentation and `>` quote prefixes
//! allowed).

use basalt_types::TaskStatus;

use crate::signifiers::{is_signifier_token, parse_signifiers, status_from_symbol, Signifiers};

/// A parsed task checkbox line (strict authoring shape).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskLineRef<'a> {
    /// Leading whitespace / blockquote prefix before the list marker.
    pub indent: &'a str,
    pub status: TaskStatus,
    /// Description with signifiers stripped, whitespace-collapsed.
    pub description: String,
    pub signifiers: Signifiers<'a>,
}

/// Strictly parse a checkbox task line: optional indent + `- [` / `* [` /
/// `N. [` marker, a single status character, then content. Inline
/// `foo - [x] bar` is NOT a task; `[x]` without a marker is not a task.
/// The indent may contain whitespace and `>` quote prefixes (same
/// permission as `basalt-parser::task_scan::is_task_checkbox`).
#[must_use]
pub fn parse_task_line(line: &str) -> Option<TaskLineRef<'_>> {
    let bytes = line.as_bytes();

    // Skip leading whitespace / blockquote prefixes; everything before the
    // marker must belong to this set.
    let mut content_start = 0;
    while content_start < bytes.len() {
        match bytes[content_start] {
            b' ' | b'\t' | b'>' => content_start += 1,
            _ => break,
        }
    }
    let indent = &line[..content_start];

    let bracket = line[content_start..]
        .find('[')
        .map(|p| p + content_start)?;
    if bracket < content_start + 2 || bytes.get(bracket - 1) != Some(&b' ') {
        return None;
    }

    // Marker: `-`, `*`, or `<digits>.` immediately before the space, and
    // the marker must be the first content on the line.
    let marker = bracket - 2;
    let marker_ok = match bytes.get(marker) {
        Some(b'-') | Some(b'*') => marker == content_start,
        Some(b'.') => {
            let mut k = marker;
            while k > content_start && bytes[k - 1].is_ascii_digit() {
                k -= 1;
            }
            k == content_start
        }
        _ => false,
    };
    if !marker_ok {
        return None;
    }

    // Exactly `[<status_char>]`.
    let close = line[bracket + 1..].find(']').map(|p| p + bracket + 1)?;
    if close != bracket + 2 {
        return None;
    }
    let status_char = bytes[bracket + 1] as char;

    let after = &line[close + 1..];
    let raw_desc = after.trim_start();

    let signifiers = parse_signifiers(raw_desc);

    // Description = everything before the first signifier token —
    // signifiers are leaf suffixes in the canonical layout, so an
    // authoring round-trip never duplicates them.
    let description = raw_desc
        .split_whitespace()
        .take_while(|t| !is_signifier_token(t))
        .collect::<Vec<_>>()
        .join(" ");

    Some(TaskLineRef {
        indent,
        status: status_from_symbol(status_char),
        description,
        signifiers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_types::{TaskPriority, TaskStatus};

    #[test]
    fn parses_basic_task() {
        let line = parse_task_line("- [ ] Buy groceries").unwrap();
        assert_eq!(line.indent, "");
        assert_eq!(line.status, TaskStatus::Todo);
        assert_eq!(line.description, "Buy groceries");
    }

    #[test]
    fn parses_indent_blockquote_and_numbered_markers() {
        assert_eq!(parse_task_line("  - [x] a").unwrap().status, TaskStatus::Done);
        assert_eq!(parse_task_line("> - [ ] q").unwrap().description, "q");
        assert_eq!(parse_task_line("  1. [ ] n").unwrap().description, "n");
        assert_eq!(parse_task_line("10. [ ] d").unwrap().description, "d");
        // Blockquote prefix is part of the indent, preserved for round-trip.
        assert_eq!(parse_task_line(">> - [x] n").unwrap().indent, ">> ");
    }

    #[test]
    fn rejects_non_task_lines() {
        assert!(parse_task_line("foo - [x] inline dash").is_none());
        assert!(parse_task_line("[x] bare").is_none());
        assert!(parse_task_line("- plain item").is_none());
        assert!(parse_task_line("- [abc] multi-char").is_none());
        assert!(parse_task_line("- []").is_none());
    }

    #[test]
    fn empty_description_is_valid() {
        let line = parse_task_line("- [x]").unwrap();
        assert_eq!(line.status, TaskStatus::Done);
        assert_eq!(line.description, "");
    }

    #[test]
    fn description_strips_signifiers_and_tags() {
        let line = parse_task_line(
            "- [ ] Ship release ⏫ 📅2024-02-01 ⏳2024-01-25 🛫2024-01-20 🔁every 2 weeks #release",
        )
        .unwrap();
        assert_eq!(line.status, TaskStatus::Todo);
        assert_eq!(line.description, "Ship release");
        assert_eq!(line.signifiers.priority, Some(TaskPriority::High));
        assert_eq!(line.signifiers.due, Some("2024-02-01"));
        assert_eq!(line.signifiers.scheduled, Some("2024-01-25"));
        assert_eq!(line.signifiers.start, Some("2024-01-20"));
        assert_eq!(line.signifiers.recurrence.as_deref(), Some("every 2 weeks"));
        assert_eq!(line.signifiers.tags, vec!["release"]);
    }

    #[test]
    fn done_date_survives_round_trip() {
        let line = parse_task_line("- [x] Deploy ✅ 2024-01-07").unwrap();
        assert_eq!(line.signifiers.done, Some("2024-01-07"));
        // The ✅ date is a signifier, not part of the description.
        assert_eq!(line.description, "Deploy");
    }

    #[test]
    fn unknown_status_is_todo() {
        assert_eq!(parse_task_line("- [z] a").unwrap().status, TaskStatus::Todo);
    }
}