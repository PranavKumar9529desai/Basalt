//! Task line serialization: build checkbox lines from input structs (ADR-048).

use super::signifiers::status_to_checkbox_char;
use super::CreateTaskInput;

/// Individual parts of a task line — assembled by the serializer.
pub(super) struct TaskLineParts<'a> {
    pub indent: &'a str,
    pub status: &'a str,
    pub description: &'a str,
    pub priority: Option<&'a str>,
    pub due: Option<&'a str>,
    pub scheduled: Option<&'a str>,
    pub start: Option<&'a str>,
    pub recurrence: Option<&'a str>,
    pub tags: Option<&'a [String]>,
}

/// Map priority name to signifier string (ADR-048 §2.3 canonical emoji).
fn priority_to_signifier(priority: &str) -> String {
    match priority {
        "highest" => " 🔺".to_string(),
        "high" => " ⏫".to_string(),
        "medium" => " 🔼".to_string(),
        "low" => " 🔽".to_string(),
        "lowest" => " ⏬".to_string(),
        _ => String::new(),
    }
}

/// Build a complete task checkbox line from input.
pub(super) fn build_task_line(input: &CreateTaskInput) -> String {
    let priority_signifier = input.priority.as_deref().map(priority_to_signifier).unwrap_or_default();
    let due_signifier = input
        .due
        .as_ref()
        .map(|d| format!(" 📅{d}"))
        .unwrap_or_default();
    let scheduled_signifier = input
        .scheduled
        .as_ref()
        .map(|d| format!(" ⏳{d}"))
        .unwrap_or_default();
    let start_signifier = input
        .start
        .as_ref()
        .map(|d| format!(" 🛫{d}"))
        .unwrap_or_default();
    let recurrence_signifier = input
        .recurrence
        .as_ref()
        .map(|r| format!(" 🔁{r}"))
        .unwrap_or_default();
    let tags_str = input
        .tags
        .as_ref()
        .map(|t| {
            t.iter()
                .map(|tag| {
                    if tag.starts_with('#') {
                        format!(" {tag}")
                    } else {
                        format!(" #{tag}")
                    }
                })
                .collect::<String>()
        })
        .unwrap_or_default();

    format!(
        "- [ ] {}{}{}{}{}{}{}",
        input.description, priority_signifier, due_signifier, scheduled_signifier,
        start_signifier, recurrence_signifier, tags_str,
    )
}

/// Build a task line from individual parts.
pub(super) fn build_task_line_from_parts(parts: TaskLineParts<'_>) -> String {
    let TaskLineParts {
        indent,
        status,
        description,
        priority,
        due,
        scheduled,
        start,
        recurrence,
        tags,
    } = parts;
    let status_char = status_to_checkbox_char(status);
    let priority_sig = priority.map(priority_to_signifier).unwrap_or_default();
    let due_sig = due.map(|d| format!(" 📅{d}")).unwrap_or_default();
    let scheduled_sig = scheduled
        .map(|d| format!(" ⏳{d}"))
        .unwrap_or_default();
    let start_sig = start.map(|d| format!(" 🛫{d}")).unwrap_or_default();
    let recurrence_sig = recurrence
        .map(|r| format!(" 🔁{r}"))
        .unwrap_or_default();
    let tags_str = tags
        .map(|t| {
            t.iter()
                .map(|tag| {
                    if tag.starts_with('#') {
                        format!(" {tag}")
                    } else {
                        format!(" #{tag}")
                    }
                })
                .collect::<String>()
        })
        .unwrap_or_default();

    format!(
        "{indent}- [{status_char}] {description}{priority_sig}{due_sig}{scheduled_sig}{start_sig}{recurrence_sig}{tags_str}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tasks::{line::parse_task_line_parts, CreateTaskInput};

    #[test]
    fn priority_round_trip_uses_canonical_emoji() {
        assert_eq!(priority_to_signifier("highest"), " 🔺");
        assert_eq!(priority_to_signifier("high"), " ⏫");
        assert_eq!(priority_to_signifier("medium"), " 🔼");
        assert_eq!(priority_to_signifier("low"), " 🔽");
        assert_eq!(priority_to_signifier("lowest"), " ⏬");
        assert_eq!(priority_to_signifier("none"), "");
    }

    #[test]
    fn build_task_line_serializes_all_signifiers() {
        let input = CreateTaskInput {
            path: "n.md".into(),
            description: "Ship release".into(),
            priority: Some("high".into()),
            due: Some("2024-02-01".into()),
            scheduled: Some("2024-01-25".into()),
            start: Some("2024-01-20".into()),
            recurrence: Some("every 2 weeks".into()),
            tags: Some(vec!["release".into(), "#ops".into()]),
        };
        let line = build_task_line(&input);
        assert_eq!(
            line,
            "- [ ] Ship release ⏫ 📅2024-02-01 ⏳2024-01-25 🛫2024-01-20 🔁every 2 weeks #release #ops"
        );
        // And the parser reads it back losslessly.
        let (_, status_char, desc, sigs) =
            parse_task_line_parts(&line).expect("round-trip line parses");
        assert_eq!(status_char, ' ');
        assert_eq!(desc, "Ship release");
        assert_eq!(sigs.priority, Some("high"));
        assert_eq!(sigs.due, Some("2024-02-01"));
        assert_eq!(sigs.scheduled, Some("2024-01-25"));
        assert_eq!(sigs.start, Some("2024-01-20"));
        assert_eq!(sigs.recurrence, Some("every 2 weeks"));
        assert_eq!(sigs.tags, vec!["#release", "#ops"]);
    }

    #[test]
    fn from_parts_preserves_indent_and_status() {
        let line = build_task_line_from_parts(TaskLineParts {
            indent: "  ",
            status: "in_progress",
            description: "WIP",
            priority: Some("lowest"),
            due: None,
            scheduled: None,
            start: None,
            recurrence: None,
            tags: None,
        });
        assert_eq!(line, "  - [/] WIP ⏬");
    }
}