use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// Checkbox status type of a task line (ADR-048 §2.2), derived from the
/// character between `[` and `]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    OnHold,
    Done,
    Cancelled,
    /// Checkbox-like content that is not a task. Not emitted by the Phase 1
    /// scanner; reserved for the query engine.
    NonTask,
}

/// Priority level of a task, from an inline emoji signifier (ADR-048 §2.3).
/// Defaults to `None` when no priority emoji is present.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Highest,
    High,
    Medium,
    None,
    Low,
    Lowest,
}

impl TaskStatus {
    /// Wire/display name (matches the serde `snake_case` rename, NOT the
    /// `Debug` spelling — `InProgress`/`OnHold` debug to "inprogress"/
    /// "onhold", which is the status-filter bug this method exists to fix).
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::OnHold => "on_hold",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
            Self::NonTask => "non_task",
        }
    }
}

impl TaskPriority {
    /// Wire/display name (matches the serde `snake_case` rename).
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Highest => "highest",
            Self::High => "high",
            Self::Medium => "medium",
            Self::None => "none",
            Self::Low => "low",
            Self::Lowest => "lowest",
        }
    }

    /// Stable numeric rank, 0 (highest) → 5 (lowest). Used for sorting and
    /// the urgency score.
    #[must_use]
    pub const fn numeric(&self) -> u8 {
        match self {
            Self::Highest => 0,
            Self::High => 1,
            Self::Medium => 2,
            Self::None => 3,
            Self::Low => 4,
            Self::Lowest => 5,
        }
    }

    /// Map a priority emoji signifier to its level.
    #[must_use]
    pub fn from_emoji(emoji: &str) -> Option<Self> {
        match emoji {
            "🔺" => Some(Self::Highest),
            "⏫" => Some(Self::High),
            "🔼" => Some(Self::Medium),
            "🔽" => Some(Self::Low),
            "⏬" => Some(Self::Lowest),
            _ => None,
        }
    }
}

/// A single task extracted from a markdown checkbox line.
///
/// Parsed by `basalt-parser::task_scan` during the ADR-041 metadata scan;
/// stored in `FileMetadata.tasks` alongside tags, links, and headings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskData {
    /// 1-indexed line number in the source file.
    pub line: u32,

    /// Task description with signifiers and their values stripped,
    /// whitespace-collapsed and trimmed.
    pub description: String,

    /// Checkbox status type derived from the character between `[` and `]`.
    pub status: TaskStatus,

    /// Priority level from the first priority emoji signifier.
    pub priority: TaskPriority,

    /// Dates extracted from signifiers. `None` when not present.
    pub created: Option<NaiveDate>,
    pub scheduled: Option<NaiveDate>,
    pub start: Option<NaiveDate>,
    pub due: Option<NaiveDate>,
    pub done: Option<NaiveDate>,
    pub cancelled: Option<NaiveDate>,

    /// Recurrence rule text after `🔁`, e.g. "every week on Monday".
    /// Stored verbatim; parsed by the recurrence engine on completion
    /// (Phase 2).
    pub recurrence: Option<String>,

    /// Whether the recurrence timing is "when done" (completion date) instead
    /// of the reference date.
    pub recurrence_when_done: bool,

    /// Tags found on the task line (e.g. `#work`, `#urgent`).
    pub tags: Vec<String>,

    /// Task ID from `🆔`, for dependency tracking.
    pub id: Option<String>,

    /// Task IDs this task depends on, from `⛔` signifiers.
    pub depends_on: Vec<String>,

    /// On-completion action from `🏁` ("keep" | "delete").
    pub on_completion: Option<String>,

    /// UTF-16 code-unit span of the full line, for CM6 decoration positioning.
    pub span_start: u32,
    pub span_end: u32,
}

impl TaskData {
    /// Whether this task counts as done for query filtering.
    #[must_use]
    pub fn is_done(&self) -> bool {
        matches!(
            self.status,
            TaskStatus::Done | TaskStatus::Cancelled | TaskStatus::NonTask
        )
    }

    /// Whether this task matches the `not done` filter.
    #[must_use]
    pub fn is_todo(&self) -> bool {
        matches!(
            self.status,
            TaskStatus::Todo | TaskStatus::InProgress | TaskStatus::OnHold
        )
    }

    /// The "happens" date — earliest of due, scheduled, start.
    #[must_use]
    pub fn happens(&self) -> Option<NaiveDate> {
        self.due.or(self.scheduled).or(self.start)
    }

    /// The next checkbox character when the task is toggled forward.
    #[must_use]
    pub fn next_status_symbol(&self) -> char {
        match self.status {
            TaskStatus::Todo => '/',
            TaskStatus::InProgress => 'x',
            TaskStatus::OnHold => 'x',
            TaskStatus::Done => ' ',
            TaskStatus::Cancelled => ' ',
            TaskStatus::NonTask => ' ',
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{TaskPriority, TaskStatus};
    use chrono::NaiveDate;

    #[test]
    fn priority_rank_order_matches_display_levels() {
        assert_eq!(TaskPriority::Highest.numeric(), 0);
        assert_eq!(TaskPriority::High.numeric(), 1);
        assert_eq!(TaskPriority::Medium.numeric(), 2);
        assert_eq!(TaskPriority::None.numeric(), 3);
        assert_eq!(TaskPriority::Low.numeric(), 4);
        assert_eq!(TaskPriority::Lowest.numeric(), 5);
    }

    #[test]
    fn priority_from_emoji_covers_all_levels() {
        assert_eq!(TaskPriority::from_emoji("🔺"), Some(TaskPriority::Highest));
        assert_eq!(TaskPriority::from_emoji("⏫"), Some(TaskPriority::High));
        assert_eq!(TaskPriority::from_emoji("🔼"), Some(TaskPriority::Medium));
        assert_eq!(TaskPriority::from_emoji("🔽"), Some(TaskPriority::Low));
        assert_eq!(TaskPriority::from_emoji("⏬"), Some(TaskPriority::Lowest));
        assert_eq!(TaskPriority::from_emoji("🚀"), None);
    }

    #[test]
    fn status_classification_matches_query_semantics() {
        let done = task(TaskStatus::Done);
        let cancelled = task(TaskStatus::Cancelled);
        let todo = task(TaskStatus::Todo);
        let in_progress = task(TaskStatus::InProgress);

        assert!(done.is_done() && !done.is_todo());
        assert!(cancelled.is_done());
        assert!(todo.is_todo() && !todo.is_done());
        assert!(in_progress.is_todo());
    }

    #[test]
    fn happens_uses_due_then_scheduled_then_start() {
        let mut t = task(TaskStatus::Todo);
        let due = NaiveDate::from_ymd_opt(2024, 1, 7).unwrap();
        let scheduled = NaiveDate::from_ymd_opt(2024, 1, 5).unwrap();
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();

        t.due = Some(due);
        t.scheduled = Some(scheduled);
        t.start = Some(start);
        assert_eq!(t.happens(), Some(due));

        t.due = None;
        assert_eq!(t.happens(), Some(scheduled));

        t.scheduled = None;
        assert_eq!(t.happens(), Some(start));

        t.start = None;
        assert_eq!(t.happens(), None);
    }

    #[test]
    fn next_symbol_cycles_through_statuses() {
        assert_eq!(task(TaskStatus::Todo).next_status_symbol(), '/');
        assert_eq!(task(TaskStatus::InProgress).next_status_symbol(), 'x');
        assert_eq!(task(TaskStatus::OnHold).next_status_symbol(), 'x');
        assert_eq!(task(TaskStatus::Done).next_status_symbol(), ' ');
        assert_eq!(task(TaskStatus::Cancelled).next_status_symbol(), ' ');
    }

    fn task(status: TaskStatus) -> super::TaskData {
        super::TaskData {
            line: 1,
            description: String::new(),
            status,
            priority: TaskPriority::None,
            created: None,
            scheduled: None,
            start: None,
            due: None,
            done: None,
            cancelled: None,
            recurrence: None,
            recurrence_when_done: false,
            tags: Vec::new(),
            id: None,
            depends_on: Vec::new(),
            on_completion: None,
            span_start: 0,
            span_end: 0,
        }
    }
}
