//! Task line scanning for the ADR-041 metadata pass (ADR-048 Phase 1).
//!
//! Recognizes markdown checkbox list items (`- [ ]`, `* [ ]`, `1. [ ]`,
//! indented or behind `>` prefixes) and extracts task signifiers — priority,
//! dates, recurrence, id, dependencies, on-completion, tags — in one
//! byte-level pass over the line. Signifier emojis are matched on their exact
//! UTF-8 byte sequences, so no UTF-8 decoding is required; the structural
//! bytes of a task line are all ASCII.

use basalt_types::{FileMetadata, TaskData, TaskPriority, TaskStatus};
use chrono::NaiveDate;

use crate::utf16::SpanCursor;

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

/// Whether `bytes[i]` is the opening `[` of a checkbox task line:
/// `[<status>]` preceded by a list marker (`- `, `* `, `N. `) that starts the
/// line (indentation and `>` quote prefixes allowed).
///
/// Inline dashes like `foo - [ ]` are not list items and are not tasks.
#[inline]
pub(crate) fn is_task_checkbox(bytes: &[u8], i: usize) -> bool {
    if i + 2 >= bytes.len() || bytes[i + 2] != b']' || i < 2 || bytes[i - 1] != b' ' {
        return false;
    }
    let marker = i - 2;
    // Numbered lists: digits directly before the `.` belong to the marker.
    let mut marker_start = marker;
    if bytes[marker] == b'.' {
        while marker_start > 0 && bytes[marker_start - 1].is_ascii_digit() {
            marker_start -= 1;
        }
        if marker_start == marker {
            return false;
        }
    } else if bytes[marker] != b'-' && bytes[marker] != b'*' {
        return false;
    }
    // Marker must start the line; only whitespace / `>` may precede it.
    for k in (0..marker_start).rev() {
        match bytes[k] {
            b' ' | b'\t' | b'>' => {}
            b'\n' | b'\r' => return true,
            _ => return false,
        }
    }
    true
}
/// Scan a checkbox task line (Tier 1 ASCII path).
///
/// `i` points at the checkbox `[`. Runs only on pure-ASCII input
/// (`input.is_ascii()`), so byte offsets equal UTF-16 code-unit offsets and
/// the byte span doubles as the CodeMirror span. Returns the byte index just
/// past the line (consuming it whole, so inner `[[links]]` stay part of the
/// task description), or `None` if the line is not a valid task.
pub(crate) fn scan_task_line(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let (line_no, line_start, line_end) = line_bounds(bytes, i);
    let task = parse_task_line(
        input,
        bytes,
        line_no,
        i,
        line_end,
        line_start as u32,
        line_end as u32,
    )?;
    push_task(meta, task);
    Some(line_end)
}

/// Scan a checkbox task line (Tier 2 Unicode path), translating the byte
/// span to UTF-16 code units via `cursor` for CodeMirror decoration.
pub(crate) fn scan_task_line_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let (line_no, line_start, line_end) = line_bounds(bytes, i);
    cursor.advance_to(line_start, input);
    let u16_start = cursor.utf16_idx;
    cursor.advance_to(line_end, input);
    let u16_end = cursor.utf16_idx;
    let task = parse_task_line(
        input,
        bytes,
        line_no,
        i,
        line_end,
        u16_start as u32,
        u16_end as u32,
    )?;
    push_task(meta, task);
    Some(line_end)
}

/// 1-indexed line number, byte bounds of the line containing `i`.
fn line_bounds(bytes: &[u8], i: usize) -> (u32, usize, usize) {
    let line_start = bytes[..i]
        .iter()
        .rposition(|&b| b == b'\n')
        .map_or(0, |p| p + 1);
    let line_end = bytes[i..]
        .iter()
        .position(|&b| b == b'\n')
        .map_or(bytes.len(), |p| i + p);
    let line_no = memchr::memchr_iter(b'\n', &bytes[..line_start]).count() as u32 + 1;
    (line_no, line_start, line_end)
}

/// Parse the task at `checkbox` (verified by `is_task_checkbox`) into
/// `TaskData`, with the line's UTF-16 span as `span_start`/`span_end`.
fn parse_task_line(
    input: &str,
    bytes: &[u8],
    line_no: u32,
    checkbox: usize,
    line_end: usize,
    span_start: u32,
    span_end: u32,
) -> Option<TaskData> {
    let content_start = checkbox + 3;
    if content_start > line_end {
        return None;
    }
    let mut task = TaskData {
        line: line_no,
        description: String::new(),
        status: status_from_char(bytes[checkbox + 1]),
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
        span_start,
        span_end,
    };
    scan_signifiers(input, bytes, content_start, line_end, &mut task);
    Some(task)
}

fn push_task(meta: &mut FileMetadata, task: TaskData) {
    // Task-line tags also feed the file-level tag index (sort+dedup happens
    // in `extract_metadata`), preserving search-by-tag behavior for checkbox
    // lines that are now consumed whole by the task scan.
    meta.tags.extend(task.tags.iter().cloned());
    meta.tasks.push(task);
}

/// Checkbox status character → `TaskStatus` (ADR-048 §2.2). Unknown symbols
/// are treated as `Todo`; their "Unknown" status name is a Phase 2 concern.
fn status_from_char(c: u8) -> TaskStatus {
    match c {
        b' ' => TaskStatus::Todo,
        b'/' => TaskStatus::InProgress,
        b'?' => TaskStatus::OnHold,
        b'x' | b'X' => TaskStatus::Done,
        b'-' => TaskStatus::Cancelled,
        _ => TaskStatus::Todo,
    }
}

/// Walk the line content, splitting it into description runs and signifiers.
/// Signifiers are recognized only at word boundaries (preceded by whitespace)
/// so emojis inside words stay in the description.
fn scan_signifiers(input: &str, bytes: &[u8], start: usize, end: usize, task: &mut TaskData) {
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
fn apply_signifier(
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
fn priority_signifier(
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
fn date_signifier(
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

fn set_date_if_none(slot: &mut Option<NaiveDate>, date: Option<NaiveDate>) {
    // First occurrence of a date kind wins.
    if slot.is_none() {
        *slot = date;
    }
}

/// Parse the recurrence rule after `🔁`: verbatim text up to the next
/// signifier or end of line, with a trailing "when done" suffix flagged
/// separately. Returns the index just past the rule.
fn apply_recurrence(input: &str, bytes: &[u8], j: usize, end: usize, task: &mut TaskData) -> usize {
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

fn set_priority_if_none(task: &mut TaskData, priority: TaskPriority) {
    // First priority emoji wins (Obsidian Tasks semantics).
    if task.priority == TaskPriority::None {
        task.priority = priority;
    }
}

/// Parse a `YYYY-MM-DD` date value after a date signifier. Returns the date
/// (when a valid one follows) and the index just past the emoji — plus the
/// date token when one was consumed. Invalid or non-ISO values are left in
/// the description.
fn parse_date_value(
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
fn value_token_bounds(bytes: &[u8], mut j: usize, end: usize) -> (usize, usize) {
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
fn scan_tag(bytes: &[u8], mut j: usize, end: usize) -> usize {
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

fn has_at(bytes: &[u8], j: usize, end: usize, pat: &str) -> bool {
    let p = pat.as_bytes();
    j + p.len() <= end && bytes[j..j + p.len()] == *p
}

/// Whether any signifier emoji starts at `p` (boundary verified by caller).
fn is_signifier_at(bytes: &[u8], p: usize, end: usize) -> bool {
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
fn flush_run(desc: &mut String, run: &str) {
    if run.is_empty() {
        return;
    }
    if !desc.is_empty() {
        desc.push(' ');
    }
    desc.push_str(run);
}

/// Collapse whitespace runs to single spaces and trim both ends.
fn collapse_whitespace(s: &str) -> String {
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

#[cfg(test)]
mod tests {
    use basalt_types::{TaskData, TaskPriority, TaskStatus};
    use chrono::NaiveDate;

    use crate::metadata::extract_metadata;

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
    }

    fn task(input: &str, idx: usize) -> TaskData {
        extract_metadata(input).tasks[idx].clone()
    }

    fn task_count(input: &str) -> usize {
        extract_metadata(input).tasks.len()
    }

    #[test]
    fn plain_todo() {
        let t = task("- [ ] Buy groceries", 0);
        assert_eq!(t.status, TaskStatus::Todo);
        assert_eq!(t.description, "Buy groceries");
        assert_eq!(t.priority, TaskPriority::None);
        assert_eq!((t.span_start, t.span_end), (0, 19));
        assert_eq!(t.line, 1);
    }

    #[test]
    fn every_signifier_from_the_adr_line() {
        // The full ADR-048 §2.1 example.
        let input = "- [x] Buy groceries 🔺 🔁 every week on Monday 🛫 2024-01-01 📅 2024-01-07 ⏳ 2024-01-05 ➕ 2024-01-01";
        let t = task(input, 0);
        assert_eq!(t.status, TaskStatus::Done);
        assert_eq!(t.description, "Buy groceries");
        assert_eq!(t.priority, TaskPriority::Highest);
        assert_eq!(t.recurrence.as_deref(), Some("every week on Monday"));
        assert!(!t.recurrence_when_done);
        assert_eq!(t.start, Some(date(2024, 1, 1)));
        assert_eq!(t.due, Some(date(2024, 1, 7)));
        assert_eq!(t.scheduled, Some(date(2024, 1, 5)));
        assert_eq!(t.created, Some(date(2024, 1, 1)));
        assert!(t.done.is_none() && t.cancelled.is_none());
    }

    #[test]
    fn every_status_symbol() {
        assert_eq!(task("- [ ] a", 0).status, TaskStatus::Todo);
        assert_eq!(task("- [/] a", 0).status, TaskStatus::InProgress);
        assert_eq!(task("- [?] a", 0).status, TaskStatus::OnHold);
        assert_eq!(task("- [x] a", 0).status, TaskStatus::Done);
        assert_eq!(task("- [X] a", 0).status, TaskStatus::Done);
        assert_eq!(task("- [-] a", 0).status, TaskStatus::Cancelled);
        // Unknown symbol → Todo (ADR-048 §2.2).
        assert_eq!(task("- [z] a", 0).status, TaskStatus::Todo);
    }

    #[test]
    fn every_priority_emoji() {
        assert_eq!(task("- [ ] a 🔺", 0).priority, TaskPriority::Highest);
        assert_eq!(task("- [ ] a ⏫", 0).priority, TaskPriority::High);
        assert_eq!(task("- [ ] a 🔼", 0).priority, TaskPriority::Medium);
        assert_eq!(task("- [ ] a 🔽", 0).priority, TaskPriority::Low);
        assert_eq!(task("- [ ] a ⏬", 0).priority, TaskPriority::Lowest);
    }

    #[test]
    fn first_priority_emoji_wins() {
        assert_eq!(task("- [ ] a 🔽 🔺", 0).priority, TaskPriority::Low);
    }

    #[test]
    fn done_and_cancelled_dates() {
        let t = task("- [x] a ✅ 2024-01-07", 0);
        assert_eq!(t.done, Some(date(2024, 1, 7)));
        let t = task("- [-] a ❌ 2024-01-06", 0);
        assert_eq!(t.cancelled, Some(date(2024, 1, 6)));
    }

    #[test]
    fn recurrence_when_done_flag() {
        let t = task("- [ ] Water plants 🔁 every 3 days when done", 0);
        assert_eq!(t.recurrence.as_deref(), Some("every 3 days"));
        assert!(t.recurrence_when_done);
    }

    #[test]
    fn recurrence_stops_at_next_signifier() {
        let input = "- [ ] a 🔁 every week 🛫 2024-01-01";
        let t = task(input, 0);
        assert_eq!(t.recurrence.as_deref(), Some("every week"));
        assert_eq!(t.start, Some(date(2024, 1, 1)));
    }

    #[test]
    fn id_depends_on_and_on_completion() {
        let t = task(
            "- [ ] Deploy 🆔 deploy-1 ⛔ build-3 ⛔ review-2 🏁 delete",
            0,
        );
        assert_eq!(t.id.as_deref(), Some("deploy-1"));
        assert_eq!(t.depends_on, vec!["build-3", "review-2"]);
        assert_eq!(t.on_completion.as_deref(), Some("delete"));
    }

    #[test]
    fn inline_tags_stripped_from_description() {
        let t = task("- [ ] Buy #groceries #urgent stuff", 0);
        assert_eq!(t.tags, vec!["groceries", "urgent"]);
        assert_eq!(t.description, "Buy stuff");
    }

    #[test]
    fn nested_tags_use_slash_separator() {
        assert_eq!(
            task("- [ ] Work #project/alpha", 0).tags,
            vec!["project/alpha"]
        );
    }

    #[test]
    fn task_tags_feed_the_file_level_tag_index() {
        let meta = extract_metadata("#work\n- [ ] Task #work #urgent");
        assert_eq!(meta.tags, vec!["urgent", "work"]);
    }

    #[test]
    fn indented_and_blockquote_tasks_parse() {
        assert_eq!(task("  - [ ] Indented", 0).description, "Indented");
        assert_eq!(task("> - [ ] Quote", 0).description, "Quote");
        assert_eq!(task(">> - [x] Nested", 0).status, TaskStatus::Done);
        assert_eq!(task("  1. [ ] Numbered", 0).description, "Numbered");
        assert_eq!(task("10. [ ] Double digit", 0).description, "Double digit");
    }

    #[test]
    fn non_task_lines_are_ignored() {
        let input =
            "- plain item\nfoo - [ ] inline dash\n[x] bare checkbox\n* emphasis\n1. plain numbered";
        assert_eq!(task_count(input), 0);
    }

    #[test]
    fn multiple_tasks_keep_document_order_and_line_numbers() {
        let input = "Intro\n- [ ] first\n- [x] second\n  - [/] third";
        let meta = extract_metadata(input);
        assert_eq!(meta.tasks.len(), 3);
        assert_eq!(meta.tasks[0].line, 2);
        assert_eq!(meta.tasks[1].line, 3);
        assert_eq!(meta.tasks[2].line, 4);
        assert_eq!(meta.tasks[2].status, TaskStatus::InProgress);
    }

    #[test]
    fn frontmatter_counts_toward_line_numbers() {
        let input = "---\ntitle: x\n---\n- [ ] Task";
        assert_eq!(task(input, 0).line, 4);
    }

    #[test]
    fn crlf_line_endings_are_trimmed() {
        let meta = extract_metadata("- [ ] Task\r\nOther");
        assert_eq!(meta.tasks.len(), 1);
        assert_eq!(meta.tasks[0].description, "Task");
    }

    #[test]
    fn empty_description_task_is_valid() {
        assert_eq!(task("- [x]", 0).description, "");
        assert_eq!(task("- [ ]", 0).status, TaskStatus::Todo);
    }

    #[test]
    fn invalid_iso_date_is_not_consumed() {
        let t = task("- [ ] Task 📅 2024-13-99", 0);
        assert!(t.due.is_none());
        assert_eq!(t.description, "Task 2024-13-99");
    }

    #[test]
    fn non_signifier_emoji_stays_in_description() {
        let t = task("- [ ] 🚀 launch plan 🔺 top", 0);
        assert_eq!(t.priority, TaskPriority::Highest);
        assert_eq!(t.description, "🚀 launch plan top");
    }

    #[test]
    fn emoji_inside_a_word_is_not_a_signifier() {
        let t = task("- [ ] cost🔺five", 0);
        assert_eq!(t.priority, TaskPriority::None);
        assert_eq!(t.description, "cost🔺five");
    }

    #[test]
    fn text_after_the_last_signifier_is_preserved() {
        let t = task("- [ ] Step 1 🔺 then do the thing", 0);
        assert_eq!(t.description, "Step 1 then do the thing");
    }

    #[test]
    fn inner_wikilinks_stay_in_the_description() {
        let meta = extract_metadata("- [ ] See [[Note]]");
        assert_eq!(meta.tasks.len(), 1);
        assert_eq!(meta.tasks[0].description, "See [[Note]]");
        assert!(meta.links.is_empty());
    }

    #[test]
    fn ascii_line_spans_are_byte_offsets() {
        let meta = extract_metadata("# H\n- [ ] Task");
        let t = &meta.tasks[0];
        assert_eq!((t.span_start, t.span_end), (4, 14));
    }

    #[test]
    fn unicode_line_spans_are_utf16_code_units() {
        // "Intro 🚀\n" = 8 UTF-16 units (🚀 is a surrogate pair); the task
        // line starts there and runs to EOF.
        let meta = extract_metadata("Intro 🚀\n- [ ] Task");
        assert_eq!(meta.tasks.len(), 1);
        assert_eq!((meta.tasks[0].span_start, meta.tasks[0].span_end), (9, 19));
    }

    #[test]
    fn emoji_signifiers_in_unicode_files_set_utf16_spans() {
        let meta = extract_metadata("- [ ] Launch 🚀 📅 2024-01-07");
        let t = &meta.tasks[0];
        assert_eq!(t.due, Some(date(2024, 1, 7)));
        assert_eq!(t.description, "Launch 🚀");
        // 29 code units: "- [ ] Launch " (12) + 🚀 (2) + " 📅" (3) + " 2024-01-07" (12)
        assert_eq!((t.span_start, t.span_end), (0, 29));
    }
}
