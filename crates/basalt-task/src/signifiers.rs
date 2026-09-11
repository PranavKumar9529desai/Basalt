//! Task signifier grammar — the single source of truth for
//! checkbox-char ↔ status, priority emoji ↔ level, and the status cycle
//! (ADR-048 §2).
//!
//! This is the typed home for logic that previously lived (in divergent,
//! string-based copies) in `src-tauri/commands/tasks/signifiers.rs` and
//! `packages/editor/src/input/task-signifiers.ts`. The Rust scanner
//! (`basalt-parser::task_scan`) runs its own byte-level fused pass over
//! whole files and stays where it is; every *line*-level grammar decision
//! lives here.
//!
//! Canonicalization decisions (roadmap §2.2/§3):
//! - Typed against the real `TaskStatus`/`TaskPriority` enums; the
//!   fabricated `"deferred"` string status is gone.
//! - Fabricated "legacy" priority tokens (`🔴🟡🔵`, `最低`, `p0–p4`) are
//!   removed — they were never real Obsidian syntax.
//! - Priority/dates are **first-wins**, matching the scanner
//!   (`set_priority_if_none` / `set_date_if_none`).

use basalt_types::{TaskPriority, TaskStatus};

// ---------------------------------------------------------------------------
// Checkbox character ↔ status
// ---------------------------------------------------------------------------

/// Checkbox character → `TaskStatus` (ADR-048 §2.2). Unknown symbols map to
/// `Todo`, matching the scanner's treatment of `[z]`.
#[must_use]
pub fn status_from_symbol(c: char) -> TaskStatus {
    match c {
        ' ' => TaskStatus::Todo,
        '/' => TaskStatus::InProgress,
        '?' => TaskStatus::OnHold,
        'x' | 'X' => TaskStatus::Done,
        '-' => TaskStatus::Cancelled,
        _ => TaskStatus::Todo,
    }
}

/// `TaskStatus` → its canonical checkbox character.
#[must_use]
pub fn status_symbol(status: TaskStatus) -> char {
    match status {
        TaskStatus::Todo => ' ',
        TaskStatus::InProgress => '/',
        TaskStatus::OnHold => '?',
        TaskStatus::Done => 'x',
        TaskStatus::Cancelled => '-',
        TaskStatus::NonTask => ' ',
    }
}

/// Status wire name (`snake_case`) → `TaskStatus`.
#[must_use]
pub fn status_from_name(name: &str) -> Option<TaskStatus> {
    match name {
        "todo" => Some(TaskStatus::Todo),
        "in_progress" => Some(TaskStatus::InProgress),
        "on_hold" => Some(TaskStatus::OnHold),
        "done" => Some(TaskStatus::Done),
        "cancelled" => Some(TaskStatus::Cancelled),
        "non_task" => Some(TaskStatus::NonTask),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Status cycle
// ---------------------------------------------------------------------------

/// The default status cycle *after* `todo`: `[ ] → [/] → [x] → [ ]`.
/// A cycle is the circular list `[Todo] ++ cycle`; the first entry is the
/// "in progress" step, the last is the "done" step. Mirrors the
/// `tasksStatusSequence` setting default (`in_progress,done`).
pub const DEFAULT_STATUS_CYCLE: &[TaskStatus] =
    &[TaskStatus::InProgress, TaskStatus::Done];

/// Next status in the circular cycle `[Todo, ...cycle]`:
/// `todo → cycle[0] → … → cycle.last → todo`. Statuses outside the cycle
/// (e.g. `on_hold` with the default cycle) move into it from the start.
#[must_use]
pub fn next_in_cycle(status: TaskStatus, cycle: &[TaskStatus]) -> TaskStatus {
    if let Some(idx) = cycle.iter().position(|s| *s == status) {
        return cycle.get(idx + 1).copied().unwrap_or(TaskStatus::Todo);
    }
    // Not on the cycle (todo, on_hold, done without a "done" entry…).
    if status == TaskStatus::Todo {
        return cycle.first().copied().unwrap_or(TaskStatus::Todo);
    }
    cycle.first().copied().unwrap_or(TaskStatus::Todo)
}

// ---------------------------------------------------------------------------
// Priority emoji ↔ level
// ---------------------------------------------------------------------------

/// Priority emoji → level. Canonical set only (ADR-048 §2.3).
#[must_use]
pub fn priority_from_emoji(emoji: &str) -> Option<TaskPriority> {
    match emoji {
        "🔺" => Some(TaskPriority::Highest),
        "⏫" => Some(TaskPriority::High),
        "🔼" => Some(TaskPriority::Medium),
        "🔽" => Some(TaskPriority::Low),
        "⏬" => Some(TaskPriority::Lowest),
        _ => None,
    }
}

/// Level → canonical priority emoji (`None` for the default level).
#[must_use]
pub fn priority_emoji(priority: TaskPriority) -> Option<&'static str> {
    match priority {
        TaskPriority::Highest => Some("🔺"),
        TaskPriority::High => Some("⏫"),
        TaskPriority::Medium => Some("🔼"),
        TaskPriority::Low => Some("🔽"),
        TaskPriority::Lowest => Some("⏬"),
        TaskPriority::None => None,
    }
}

/// Priority wire name → level.
#[must_use]
pub fn priority_from_name(name: &str) -> Option<TaskPriority> {
    match name {
        "highest" => Some(TaskPriority::Highest),
        "high" => Some(TaskPriority::High),
        "medium" => Some(TaskPriority::Medium),
        "none" => Some(TaskPriority::None),
        "low" => Some(TaskPriority::Low),
        "lowest" => Some(TaskPriority::Lowest),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Signifier parsing (line-level, first-wins)
// ---------------------------------------------------------------------------

/// Parsed signifiers from a task line (borrows from the source line).
/// Tags are stored **without** the leading `#` — the same convention as the
/// scanner and the query engine.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Signifiers<'a> {
    pub priority: Option<TaskPriority>,
    pub created: Option<&'a str>,
    pub due: Option<&'a str>,
    pub scheduled: Option<&'a str>,
    pub start: Option<&'a str>,
    pub done: Option<&'a str>,
    pub cancelled: Option<&'a str>,
    /// Rule text (e.g. "every week on Monday") — owned because it is the
    /// join of several source tokens in the separated form (`🔁 every week`).
    pub recurrence: Option<String>,
    pub id: Option<&'a str>,
    pub depends_on: Vec<&'a str>,
    pub on_completion: Option<&'a str>,
    pub tags: Vec<&'a str>,
}

/// A whitespace-delimited token that begins a signifier — bounds recurrence
/// absorption and the description prefix ("every week on Monday" stays one
/// rule; "#tag" after it does not).
#[must_use]
pub fn is_signifier_token(t: &str) -> bool {
    t.starts_with("📅")
        || t.starts_with("🛫")
        || t.starts_with("⏳")
        || t.starts_with("➕")
        || t.starts_with("✅")
        || t.starts_with("❌")
        || t.starts_with("🔁")
        || t.starts_with("🆔")
        || t.starts_with("⛔")
        || t.starts_with("🏁")
        || t.starts_with("🔺")
        || t.starts_with("⏫")
        || t.starts_with("🔼")
        || t.starts_with("🔽")
        || t.starts_with("⏬")
        || t.starts_with('#')
}

/// Parse signifiers from the post-checkbox line content. Priority is
/// first-wins and only the first date per kind survives — matching the
/// fused scanner in `basalt-parser::task_scan`. Both glued (`📅2024-01-07`)
/// and separated (`📅 2024-01-07`) value forms are accepted.
#[must_use]
pub fn parse_signifiers(desc: &str) -> Signifiers<'_> {
    let mut out = Signifiers::default();

    let tokens: Vec<&str> = desc.split_whitespace().collect();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        match signifier_emoji(token) {
            // Priority — first wins.
            Some(emoji) if is_priority_emoji(emoji) => {
                if out.priority.is_none() {
                    out.priority = priority_from_emoji(emoji);
                }
                i += 1;
            }
            // Dates — glued value, or the next token when it is ISO.
            Some(emoji) if is_date_emoji(emoji) => {
                let glued = token.strip_prefix(emoji).unwrap_or("");
                let (value, consumed) = if !glued.is_empty() {
                    (glued, 1)
                } else if tokens.get(i + 1).is_some_and(|t| is_iso_date(t)) {
                    (tokens[i + 1], 2)
                } else {
                    ("", 1)
                };
                if !value.is_empty() {
                    let slot: &mut Option<&str> = match emoji {
                        "➕" => &mut out.created,
                        "📅" => &mut out.due,
                        "⏳" => &mut out.scheduled,
                        "🛫" => &mut out.start,
                        "✅" => &mut out.done,
                        "❌" => &mut out.cancelled,
                        _ => unreachable!("date emoji checked by caller"),
                    };
                    if slot.is_none() {
                        *slot = Some(value);
                    }
                }
                i += consumed;
            }
            // Recurrence — rule text up to the next signifier token.
            Some(emoji) if emoji == RECURRENCE => {
                if out.recurrence.is_none() {
                    let mut parts: Vec<&str> = Vec::new();
                    let mut j = i + 1;
                    let glued = token.strip_prefix(RECURRENCE).unwrap_or("");
                    if !glued.is_empty() {
                        parts.push(glued);
                    }
                    while j < tokens.len() && !is_signifier_token(tokens[j]) {
                        parts.push(tokens[j]);
                        j += 1;
                    }
                    if !parts.is_empty() {
                        out.recurrence = Some(parts.join(" "));
                    }
                    i = j;
                } else {
                    i += 1;
                }
            }
            // 🆔 / 🏁 — single value token (glued or the next token).
            Some(emoji) if emoji == TASK_ID || emoji == ON_COMPLETION => {
                let slot = if emoji == TASK_ID {
                    &mut out.id
                } else {
                    &mut out.on_completion
                };
                let glued = token.strip_prefix(emoji).unwrap_or("");
                let (value, consumed) = if !glued.is_empty() {
                    (glued, 1)
                } else {
                    match tokens.get(i + 1) {
                        Some(next) => (*next, 2),
                        None => ("", 1),
                    }
                };
                if slot.is_none() && !value.is_empty() {
                    *slot = Some(value);
                }
                i += consumed;
            }
            // ⛔ — value token(s); repeatable.
            Some(emoji) if emoji == DEPENDS_ON => {
                let glued = token.strip_prefix(DEPENDS_ON).unwrap_or("");
                if !glued.is_empty() {
                    out.depends_on.push(glued);
                    i += 1;
                } else if let Some(next) = tokens.get(i + 1) {
                    out.depends_on.push(next);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            // #tag — stored without the '#', matching the scanner.
            Some(emoji) if emoji == TAG => {
                out.tags.push(token.trim_start_matches('#'));
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

/// The signifier a token starts with, at a word boundary. Returns the
/// emoji text (`"#"` for tags) or `None` for plain words.
fn signifier_emoji(token: &str) -> Option<&'static str> {
    [
        PRIORITY_HIGHEST,
        PRIORITY_HIGH,
        PRIORITY_MEDIUM,
        PRIORITY_LOW,
        PRIORITY_LOWEST,
        DATE_CREATED,
        DATE_DUE,
        DATE_SCHEDULED,
        DATE_START,
        DATE_DONE,
        DATE_CANCELLED,
        RECURRENCE,
        TASK_ID,
        DEPENDS_ON,
        ON_COMPLETION,
    ]
    .into_iter()
    .find(|emoji| token.starts_with(*emoji))
    .or_else(|| token.starts_with('#').then_some(TAG))
}

const TAG: &str = "#";

const RECURRENCE: &str = "🔁";
const TASK_ID: &str = "🆔";
const DEPENDS_ON: &str = "⛔";
const ON_COMPLETION: &str = "🏁";

const PRIORITY_HIGHEST: &str = "🔺";
const PRIORITY_HIGH: &str = "⏫";
const PRIORITY_MEDIUM: &str = "🔼";
const PRIORITY_LOW: &str = "🔽";
const PRIORITY_LOWEST: &str = "⏬";

const DATE_CREATED: &str = "➕";
const DATE_DUE: &str = "📅";
const DATE_SCHEDULED: &str = "⏳";
const DATE_START: &str = "🛫";
const DATE_DONE: &str = "✅";
const DATE_CANCELLED: &str = "❌";

fn is_priority_emoji(emoji: &str) -> bool {
    matches!(emoji, "🔺" | "⏫" | "🔼" | "🔽" | "⏬")
}

fn is_date_emoji(emoji: &str) -> bool {
    matches!(emoji, "➕" | "📅" | "⏳" | "🛫" | "✅" | "❌")
}

/// `YYYY-MM-DD` (strict, calendar-valid).
fn is_iso_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_round_trip_covers_all_symbols() {
        for (c, expected) in [
            (' ', TaskStatus::Todo),
            ('/', TaskStatus::InProgress),
            ('?', TaskStatus::OnHold),
            ('x', TaskStatus::Done),
            ('X', TaskStatus::Done),
            ('-', TaskStatus::Cancelled),
        ] {
            assert_eq!(status_from_symbol(c), expected);
            assert_eq!(status_symbol(expected), if c == 'X' { 'x' } else { c });
        }
    }

    #[test]
    fn unknown_symbol_maps_to_todo() {
        assert_eq!(status_from_symbol('z'), TaskStatus::Todo);
    }

    #[test]
    fn status_names_are_snake_case() {
        assert_eq!(status_from_name("todo"), Some(TaskStatus::Todo));
        assert_eq!(status_from_name("in_progress"), Some(TaskStatus::InProgress));
        assert_eq!(status_from_name("on_hold"), Some(TaskStatus::OnHold));
        assert_eq!(status_from_name("done"), Some(TaskStatus::Done));
        assert_eq!(status_from_name("cancelled"), Some(TaskStatus::Cancelled));
        assert_eq!(status_from_name("inprogress"), None); // the old Debug-derived bug
        assert_eq!(status_from_name("onhold"), None);
    }

    #[test]
    fn cycle_matches_settings_default() {
        let cycle = DEFAULT_STATUS_CYCLE;
        assert_eq!(next_in_cycle(TaskStatus::Todo, cycle), TaskStatus::InProgress);
        assert_eq!(next_in_cycle(TaskStatus::InProgress, cycle), TaskStatus::Done);
        assert_eq!(next_in_cycle(TaskStatus::Done, cycle), TaskStatus::Todo);
    }

    #[test]
    fn cycle_with_done_only_skips_in_progress() {
        let cycle = [TaskStatus::Done];
        assert_eq!(next_in_cycle(TaskStatus::Todo, &cycle), TaskStatus::Done);
        assert_eq!(next_in_cycle(TaskStatus::Done, &cycle), TaskStatus::Todo);
        // In-progress tasks fall into the cycle from the start.
        assert_eq!(next_in_cycle(TaskStatus::InProgress, &cycle), TaskStatus::Done);
    }

    #[test]
    fn priority_round_trip_is_first_wins() {
        assert_eq!(priority_from_emoji("🔺"), Some(TaskPriority::Highest));
        assert_eq!(priority_emoji(TaskPriority::Highest), Some("🔺"));
        assert_eq!(priority_emoji(TaskPriority::None), None);
        // First-wins, matching the scanner: later emoji do not override.
        let sigs = parse_signifiers("a 🔽 b 🔺");
        assert_eq!(sigs.priority, Some(TaskPriority::Low));
    }

    #[test]
    fn parses_full_signifier_set_first_wins() {
        let sigs = parse_signifiers(
            "Fix bug ⏫ 📅2024-01-07 📅2024-02-01 ⏳2024-01-05 🛫2024-01-01 \
             🔁every 2 weeks on Friday 🆔task-1 ⛔build-3 🏁keep #work #urgent",
        );
        assert_eq!(sigs.priority, Some(TaskPriority::High));
        assert_eq!(sigs.due, Some("2024-01-07")); // first date wins
        assert_eq!(sigs.scheduled, Some("2024-01-05"));
        assert_eq!(sigs.start, Some("2024-01-01"));
        assert_eq!(sigs.recurrence.as_deref(), Some("every 2 weeks on Friday"));
        assert_eq!(sigs.id, Some("task-1"));
        assert_eq!(sigs.depends_on, vec!["build-3"]);
        assert_eq!(sigs.on_completion, Some("keep"));
        assert_eq!(sigs.tags, vec!["work", "urgent"]); // no '#' prefix
    }

    #[test]
    fn done_and_cancelled_dates_and_recurrence_absorption() {
        let sigs = parse_signifiers("Ship ✅ 2024-01-07 ❌ 2024-01-06 🔁every day");
        assert_eq!(sigs.done, Some("2024-01-07"));
        assert_eq!(sigs.cancelled, Some("2024-01-06"));
        assert_eq!(sigs.recurrence.as_deref(), Some("every day"));
    }

    #[test]
    fn non_signifier_words_stay_descriptive() {
        let sigs = parse_signifiers("plain text 🔺 high priority");
        assert_eq!(sigs.priority, Some(TaskPriority::Highest));
        // parse_signifiers does not compute the description — line.rs does.
        assert!(sigs.tags.is_empty());
        assert_eq!(sigs.due, None);
    }

    #[test]
    fn legacy_tokens_are_not_recognized() {
        // Fabricated tokens were removed (roadmap §2.2) — they parse as
        // plain text, not priorities.
        let sigs = parse_signifiers("🔴 p1 🟡 p2");
        assert_eq!(sigs.priority, None);
    }
}