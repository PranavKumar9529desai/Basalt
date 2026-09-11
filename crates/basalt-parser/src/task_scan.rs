//! Task line scanning for the ADR-041 metadata pass (ADR-048 Phase 1).
//!
//! Recognizes markdown checkbox list items (`- [ ]`, `* [ ]`, `1. [ ]`,
//! indented or behind `>` prefixes), then hands the line content to
//! [`signifiers`] for signifier extraction. Signifier emojis are matched on
//! their exact UTF-8 byte sequences, so no UTF-8 decoding is required; the
//! structural bytes of a task line are all ASCII.

use basalt_types::{FileMetadata, TaskData, TaskPriority, TaskStatus};

use crate::task_scan::signifiers::scan_signifiers;
use crate::utf16::SpanCursor;

mod signifiers;
#[cfg(test)]
mod tests;

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
