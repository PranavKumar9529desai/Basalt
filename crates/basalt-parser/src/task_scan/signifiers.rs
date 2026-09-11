//! Task signifier recognition: priority emojis, dates, recurrence, IDs,
//! dependencies, and on-completion actions, scanned in one byte-level pass
//! over a task line.

use basalt_types::{TaskData, TaskPriority};
use chrono::NaiveDate;

// Signifier emoji UTF-8 sequences (ADR-048 §2.1).
const PRIORITY_HIGHEST: &str = "🔺";
const PRIORITY_HIGH: &str = "⏫";
const PRIORITY_MEDIUM: &str = "🔼";
const PRIORITY_LOW: &str = "🔽";
const PRIORITY_LOWEST: &str = "⏬";
const DATE_START: &str = "🛫";
const DATE_DUE: &str = "📅";
const DATE_SCHEDULED: &str = "⏳";
const DATE_CREATED: &str = "➕";
const DATE_DONE: &str = "✅";
const DATE_CANCELLED: &str = "❌";
const RECURRENCE: &str = "🔁";
const TASK_ID: &str = "🆔";
const DEPENDS_ON: &str = "⛔";
const ON_COMPLETION: &str = "🏁";

pub(crate) fn scan_signifiers(
    input: &str,
    bytes: &[u8],
    start: usize,
    end: usize,
    task: &mut TaskData,
) {
    let mut j = start;
    let mut run_start = start;
    let mut desc = String::new();

    while j < end {
        let at_boundary = j == start || bytes[j - 1].is_ascii_whitespace();
        if at_boundary {
            if let Some(next) = apply_signifier(input, bytes, j, end, task) {
                flush_run(&mut desc, &input[run_start..j]);
                j = next;
                run_start = j;
                continue;
            }
            if bytes[j] == b'#' && j + 1 < end {
                let tag_end = scan_tag(bytes, j + 1, end);
                if tag_end > j + 1 {
                    task.tags.push(input[j + 1..tag_end].to_string());
                    flush_run(&mut desc, &input[run_start..j]);
                    j = tag_end;
                    run_start = j;
                    continue;
                }
            }
        }
        j += 1;
    }
    flush_run(&mut desc, &input[run_start..end]);
    task.description = collapse_whitespace(&desc);
}
pub(crate) fn apply_signifier(
    input: &str,
    bytes: &[u8],
    j: usize,
    end: usize,
    task: &mut TaskData,
) -> Option<usize> {
    if let Some(next) =
        priority_signifier(bytes, j, end, PRIORITY_HIGHEST, TaskPriority::Highest, task)
    {
        return Some(next);
    }
    if let Some(next) = priority_signifier(bytes, j, end, PRIORITY_HIGH, TaskPriority::High, task) {
        return Some(next);
    }
    if let Some(next) =
        priority_signifier(bytes, j, end, PRIORITY_MEDIUM, TaskPriority::Medium, task)
    {
        return Some(next);
    }
    if let Some(next) = priority_signifier(bytes, j, end, PRIORITY_LOW, TaskPriority::Low, task) {
        return Some(next);
    }
    if let Some(next) =
        priority_signifier(bytes, j, end, PRIORITY_LOWEST, TaskPriority::Lowest, task)
    {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_DUE, &mut task.due) {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_SCHEDULED, &mut task.scheduled) {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_START, &mut task.start) {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_CREATED, &mut task.created) {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_DONE, &mut task.done) {
        return Some(next);
    }
    if let Some(next) = date_signifier(input, bytes, j, end, DATE_CANCELLED, &mut task.cancelled) {
        return Some(next);
    }
    if has_at(bytes, j, end, RECURRENCE) {
        return Some(apply_recurrence(input, bytes, j, end, task));
    }
    if has_at(bytes, j, end, TASK_ID) {
        let (s, e) = value_token_bounds(bytes, j + TASK_ID.len(), end);
        if e > s {
            task.id = Some(input[s..e].to_string());
        }
        return Some(e);
    }
    if has_at(bytes, j, end, DEPENDS_ON) {
        let (s, e) = value_token_bounds(bytes, j + DEPENDS_ON.len(), end);
        if e > s {
            task.depends_on.push(input[s..e].to_string());
        }
        return Some(e);
    }
    if has_at(bytes, j, end, ON_COMPLETION) {
        let (s, e) = value_token_bounds(bytes, j + ON_COMPLETION.len(), end);
        if e > s {
            task.on_completion = Some(input[s..e].to_string());
        }
        return Some(e);
    }
    None
}

/// `emoji` at `j` → set `priority` (first wins), consume the emoji.
pub(crate) fn priority_signifier(
    bytes: &[u8],
    j: usize,
    end: usize,
    emoji: &str,
    priority: TaskPriority,
    task: &mut TaskData,
) -> Option<usize> {
    if has_at(bytes, j, end, emoji) {
        set_priority_if_none(task, priority);
        Some(j + emoji.len())
    } else {
        None
    }
}

/// Date signifier at `j` → parse its `YYYY-MM-DD` value into `slot`
/// (first wins), consume the emoji (and the date when valid).
pub(crate) fn date_signifier(
    input: &str,
    bytes: &[u8],
    j: usize,
    end: usize,
    emoji: &str,
    slot: &mut Option<NaiveDate>,
) -> Option<usize> {
    if has_at(bytes, j, end, emoji) {
        let (date, next) = parse_date_value(input, bytes, j + emoji.len(), end);
        set_date_if_none(slot, date);
        Some(next)
    } else {
        None
    }
}

pub(crate) fn set_date_if_none(slot: &mut Option<NaiveDate>, date: Option<NaiveDate>) {
    // First occurrence of a date kind wins.
    if slot.is_none() {
        *slot = date;
    }
}

/// Parse the recurrence rule after `🔁`: verbatim text up to the next
/// signifier or end of line, with a trailing "when done" suffix flagged
/// separately. Returns the index just past the rule.
pub(crate) fn apply_recurrence(
    input: &str,
    bytes: &[u8],
    j: usize,
    end: usize,
    task: &mut TaskData,
) -> usize {
    let after = j + RECURRENCE.len();
    let mut rule_end = after;
    while rule_end < end {
        if bytes[rule_end - 1].is_ascii_whitespace() && is_signifier_at(bytes, rule_end, end) {
            break;
        }
        rule_end += 1;
    }
    let rule = input[after..rule_end].trim();
    let (rule, when_done) = match rule.strip_suffix("when done") {
        Some(base) => (base.trim_end(), true),
        None => (rule, false),
    };
    if !rule.is_empty() {
        task.recurrence = Some(rule.to_string());
        task.recurrence_when_done = when_done;
    }
    rule_end
}

pub(crate) fn set_priority_if_none(task: &mut TaskData, priority: TaskPriority) {
    // First priority emoji wins (Obsidian Tasks semantics).
    if task.priority == TaskPriority::None {
        task.priority = priority;
    }
}

/// Parse a `YYYY-MM-DD` date value after a date signifier. Returns the date
/// (when a valid one follows) and the index just past the emoji — plus the
/// date token when one was consumed. Invalid or non-ISO values are left in
/// the description.
pub(crate) fn parse_date_value(
    input: &str,
    bytes: &[u8],
    mut j: usize,
    end: usize,
) -> (Option<NaiveDate>, usize) {
    while j < end && bytes[j] == b' ' {
        j += 1;
    }
    if j + 10 <= end
        && bytes[j + 4] == b'-'
        && bytes[j + 7] == b'-'
        && bytes[j..j + 10]
            .iter()
            .all(|b| b.is_ascii_digit() || *b == b'-')
    {
        if let Some(s) = input.get(j..j + 10) {
            if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                return (Some(date), j + 10);
            }
        }
    }
    (None, j)
}

/// Bounds of the whitespace-delimited value token following a signifier.
pub(crate) fn value_token_bounds(bytes: &[u8], mut j: usize, end: usize) -> (usize, usize) {
    while j < end && bytes[j].is_ascii_whitespace() {
        j += 1;
    }
    let start = j;
    while j < end && !bytes[j].is_ascii_whitespace() {
        j += 1;
    }
    (start, j)
}

/// End of the tag name after `#`. Nested tags (`#a/b`) share Obsidian's
/// slash separator; hex colors and all-digit tokens are accepted here —
/// whether they display as tags is the UI's call.
pub(crate) fn scan_tag(bytes: &[u8], mut j: usize, end: usize) -> usize {
    while j < end {
        let b = bytes[j];
        if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'/' || b > 127 {
            j += 1;
        } else {
            break;
        }
    }
    j
}

pub(crate) fn has_at(bytes: &[u8], j: usize, end: usize, pat: &str) -> bool {
    let p = pat.as_bytes();
    j + p.len() <= end && bytes[j..j + p.len()] == *p
}

/// Whether any signifier emoji starts at `p` (boundary verified by caller).
pub(crate) fn is_signifier_at(bytes: &[u8], p: usize, end: usize) -> bool {
    [
        PRIORITY_HIGHEST,
        PRIORITY_HIGH,
        PRIORITY_MEDIUM,
        PRIORITY_LOW,
        PRIORITY_LOWEST,
        DATE_START,
        DATE_DUE,
        DATE_SCHEDULED,
        DATE_CREATED,
        DATE_DONE,
        DATE_CANCELLED,
        RECURRENCE,
        TASK_ID,
        DEPENDS_ON,
        ON_COMPLETION,
    ]
    .iter()
    .any(|s| has_at(bytes, p, end, s))
}

#[inline]
pub(crate) fn flush_run(desc: &mut String, run: &str) {
    if run.is_empty() {
        return;
    }
    if !desc.is_empty() {
        desc.push(' ');
    }
    desc.push_str(run);
}

/// Collapse whitespace runs to single spaces and trim both ends.
pub(crate) fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            pending_space = !out.is_empty();
        } else {
            if pending_space {
                out.push(' ');
                pending_space = false;
            }
            out.push(c);
        }
    }
    out
}
