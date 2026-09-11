//! Lossless task line serialization (ADR-048 §2.1).
//!
//! One builder. Unifies the old `build_task_line` / `build_task_line_from_parts`
//! into a single canonical layout: `marker, description, priority, created,
//! due, scheduled, start, done, cancelled, recurrence, tags`. Signifier
//! order is the serializer's own — the parser is order-agnostic, so
//! round-trips stay lossless.

use basalt_types::{TaskPriority, TaskStatus};

use crate::signifiers::{priority_emoji, status_symbol};

/// Parts of a task line — assembled by [`build_task_line`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskLineParts<'a> {
    pub indent: &'a str,
    pub status: TaskStatus,
    pub description: &'a str,
    pub priority: Option<TaskPriority>,
    pub created: Option<&'a str>,
    pub due: Option<&'a str>,
    pub scheduled: Option<&'a str>,
    pub start: Option<&'a str>,
    pub done: Option<&'a str>,
    pub cancelled: Option<&'a str>,
    pub recurrence: Option<&'a str>,
    pub id: Option<&'a str>,
    pub depends_on: &'a [String],
    pub on_completion: Option<&'a str>,
    pub tags: Option<&'a [String]>,
}

/// Build the canonical checkbox line for `parts`.
#[must_use]
pub fn build_task_line(parts: &TaskLineParts<'_>) -> String {
    let mut out = String::with_capacity(64);
    out.push_str(parts.indent);
    out.push_str("- [");
    out.push(status_symbol(parts.status));
    out.push_str("] ");
    out.push_str(parts.description);

    if let Some(p) = parts.priority {
        if let Some(emoji) = priority_emoji(p) {
            out.push(' ');
            out.push_str(emoji);
        }
    }
    append_date(&mut out, "➕", parts.created);
    append_date(&mut out, "📅", parts.due);
    append_date(&mut out, "⏳", parts.scheduled);
    append_date(&mut out, "🛫", parts.start);
    append_date(&mut out, "✅", parts.done);
    append_date(&mut out, "❌", parts.cancelled);
    if let Some(rule) = parts.recurrence {
        out.push_str(" 🔁");
        out.push_str(rule);
    }
    if let Some(id) = parts.id {
        out.push_str(" 🆔");
        out.push_str(id);
    }
    for dep in parts.depends_on {
        out.push_str(" ⛔");
        out.push_str(dep);
    }
    if let Some(oc) = parts.on_completion {
        out.push_str(" 🏁");
        out.push_str(oc);
    }
    if let Some(tags) = parts.tags {
        for tag in tags {
            // Tags are stored without '#'; the serializer adds it.
            out.push_str(" #");
            out.push_str(tag.trim_start_matches('#'));
        }
    }
    out
}

/// Append ` <emoji><value>` when `value` is present.
fn append_date(out: &mut String, emoji: &str, value: Option<&str>) {
    if let Some(v) = value {
        out.push(' ');
        out.push_str(emoji);
        out.push_str(v);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line::parse_task_line;
    use basalt_types::TaskStatus;

    fn parts(tags: Option<&[String]>) -> TaskLineParts<'_> {
        TaskLineParts {
            indent: "",
            status: TaskStatus::Todo,
            description: "Ship release",
            priority: Some(TaskPriority::High),
            created: None,
            due: Some("2024-02-01"),
            scheduled: Some("2024-01-25"),
            start: Some("2024-01-20"),
            done: None,
            cancelled: None,
            recurrence: Some("every 2 weeks"),
            id: None,
            depends_on: &[],
            on_completion: None,
            tags,
        }
    }

    #[test]
    fn serializes_canonical_layout() {
        let tags = [String::from("release"), String::from("#ops")];
        let line = build_task_line(&parts(Some(&tags)));
        assert_eq!(
            line,
            "- [ ] Ship release ⏫ 📅2024-02-01 ⏳2024-01-25 🛫2024-01-20 🔁every 2 weeks #release #ops"
        );
    }

    #[test]
    fn round_trip_is_lossless() {
        let tags = [String::from("release"), String::from("#ops")];
        let p = parts(Some(&tags));
        let line = build_task_line(&p);
        let parsed = parse_task_line(&line).unwrap();
        assert_eq!(parsed.status, TaskStatus::Todo);
        assert_eq!(parsed.description, "Ship release");
        assert_eq!(parsed.signifiers.priority, p.priority);
        assert_eq!(parsed.signifiers.due, p.due);
        assert_eq!(parsed.signifiers.scheduled, p.scheduled);
        assert_eq!(parsed.signifiers.start, p.start);
        assert_eq!(parsed.signifiers.recurrence.as_deref(), p.recurrence.as_deref());
        assert_eq!(parsed.signifiers.tags, vec!["release", "ops"]);
    }

    #[test]
    fn preserves_indent_and_status() {
        let line = build_task_line(&TaskLineParts {
            indent: "  ",
            status: TaskStatus::InProgress,
            description: "WIP",
            priority: Some(TaskPriority::Lowest),
            created: None,
            due: None,
            scheduled: None,
            start: None,
            done: None,
            cancelled: None,
            recurrence: None,
            id: None,
            depends_on: &[],
            on_completion: None,
            tags: None,
        });
        assert_eq!(line, "  - [/] WIP ⏬");
    }

    #[test]
    fn round_trips_every_signifier_kind() {
        let line = build_task_line(&TaskLineParts {
            indent: "",
            status: TaskStatus::Done,
            description: "Deploy",
            priority: None,
            created: Some("2024-01-01"),
            due: None,
            scheduled: None,
            start: None,
            done: Some("2024-01-07"),
            cancelled: None,
            recurrence: Some("every week"),
            id: Some("deploy-1"),
            depends_on: &["build-3".to_string()],
            on_completion: Some("keep"),
            tags: None,
        });
        let parsed = parse_task_line(&line).unwrap();
        assert_eq!(parsed.status, TaskStatus::Done);
        assert_eq!(parsed.signifiers.created, Some("2024-01-01"));
        assert_eq!(parsed.signifiers.done, Some("2024-01-07"));
        assert_eq!(parsed.signifiers.recurrence.as_deref(), Some("every week"));
        assert_eq!(parsed.signifiers.id, Some("deploy-1"));
        assert_eq!(parsed.signifiers.depends_on, vec!["build-3"]);
        assert_eq!(parsed.signifiers.on_completion, Some("keep"));
    }

    #[test]
    fn empty_description_serializes_cleanly() {
        let line = build_task_line(&TaskLineParts {
            indent: "",
            status: TaskStatus::Todo,
            description: "",
            priority: None,
            created: None,
            due: None,
            scheduled: None,
            start: None,
            done: None,
            cancelled: None,
            recurrence: None,
            id: None,
            depends_on: &[],
            on_completion: None,
            tags: None,
        });
        assert_eq!(line, "- [ ] ");
    }
}