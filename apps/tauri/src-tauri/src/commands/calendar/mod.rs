//! Calendar sidebar (Obsidian Calendar plugin parity): a monthly activity
//! snapshot for the daily-notes folder.
//!
//! `calendar_activity` scans the daily-notes folder, matches each `.md`
//! filename against the user's date format, and returns per-day aggregates
//! (existence, word count, unfinished tasks) for one month. Doing this in
//! Rust keeps the calendar off the JS main thread: one batch IPC call
//! instead of N per-file calls, and no note content shipped over the bridge.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::commands::common::{canonical_vault_path, resolve_parent_dir};
use crate::error::AppResult;
use basalt_task::signifiers::status_from_symbol;
use basalt_types::TaskStatus;

/// Per-day activity summary returned to the calendar grid.
#[derive(Debug, Clone, Serialize, Default)]
pub struct DayActivity {
    pub exists: bool,
    pub word_count: u32,
    pub unfinished_tasks: u32,
}

// ---------------------------------------------------------------------------
// Date-format matching
// ---------------------------------------------------------------------------
//
// The frontend owns date formatting (ADR-036 §Conventions 3); this command
// needs only the *inverse*: identify which existing files are daily notes and
// which date each one represents. We translate the Moment-style format string
// into a list of deterministic match parts and greedily consume a filename.

const MONTHS_FULL: &[&str] = &[
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const MONTHS_SHORT: &[&str] = &[
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// One piece of a compiled date format.
#[derive(Debug, Clone, PartialEq)]
enum Part {
    /// Literal text that must match exactly.
    Literal(char),
    /// Exactly `width` digits (year).
    YearDigits(usize),
    /// 1–2 digit month number.
    MonthNum,
    /// 1–2 digit day number.
    DayNum,
    /// Full month name (MMMM).
    MonthFull,
    /// Short month name (MMM).
    MonthShort,
    /// Token we don't use for dating (weekday/time) — consume one word.
    Skip,
}

/// Compile a Moment-style format string into deterministic match parts.
/// Tokens follow the frontend's `date-format.ts` (ADR-036): longest-first
/// `YYYY/YY/MMMM/MMM/MM/M/DD/D/dddd/ddd/dd/d/HH/H/hh/h/mm/m/ss/s/A/a`;
/// `[Q]`-style escapes and all other chars are literal text.
fn compile_format(format: &str) -> Vec<Part> {
    let chars: Vec<char> = format.chars().collect();
    let mut parts: Vec<Part> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        // Literal escape: [anything]
        if c == '[' {
            let mut j = i + 1;
            while j < chars.len() && chars[j] != ']' {
                parts.push(Part::Literal(chars[j]));
                j += 1;
            }
            i = if j < chars.len() { j + 1 } else { j };
            continue;
        }

        // Run length of the same letter — token disambiguation.
        let mut run = 1;
        while i + run < chars.len() && chars[i + run] == c {
            run += 1;
        }

        let part = match c {
            'Y' if run >= 4 => Some(Part::YearDigits(4)),
            'Y' if run == 2 => Some(Part::YearDigits(2)),
            'M' if run == 4 => Some(Part::MonthFull),
            'M' if run == 3 => Some(Part::MonthShort),
            'M' => Some(Part::MonthNum),
            'D' if run <= 2 => Some(Part::DayNum),
            'd' | 'H' | 'h' | 'm' | 's' | 'A' | 'a' if run >= 1 => Some(Part::Skip),
            _ => None,
        };

        match part {
            Some(part) => {
                parts.push(part);
                i += run;
            }
            None => {
                parts.push(Part::Literal(c));
                i += 1;
            }
        }
    }
    parts
}

/// Try to extract `(year, month, day)` from a filename stem using the
/// compiled format. Greedy left-to-right; returns None on any mismatch or an
/// invalid calendar date. Two-digit years resolve to 19xx when ≥ 70, else 20xx.
fn match_date(stem: &str, parts: &[Part]) -> Option<(i32, u32, u32)> {
    let mut chars = stem.char_indices().peekable();
    let mut year: Option<i32> = None;
    let mut month: Option<u32> = None;
    let mut day: Option<u32> = None;

    for part in parts {
        match part {
            Part::Literal(lit) => {
                match chars.next() {
                    Some((_, c)) if c == *lit => {}
                    _ => return None,
                }
            }
            Part::YearDigits(width) => {
                let mut s = String::new();
                for _ in 0..*width {
                    match chars.peek() {
                        Some(&(_, c)) if c.is_ascii_digit() => {
                            s.push(c);
                            chars.next();
                        }
                        _ => return None,
                    }
                }
                let parsed: i32 = s.parse().ok()?;
                year = Some(if *width == 2 {
                    if parsed >= 70 {
                        1900 + parsed
                    } else {
                        2000 + parsed
                    }
                } else {
                    parsed
                });
            }
            Part::MonthNum | Part::DayNum => {
                let mut s = String::new();
                while let Some(&(_, c)) = chars.peek() {
                    if c.is_ascii_digit() && s.len() < 2 {
                        s.push(c);
                        chars.next();
                    } else {
                        break;
                    }
                }
                if s.is_empty() {
                    return None;
                }
                let v: u32 = s.parse().ok()?;
                if matches!(part, Part::MonthNum) {
                    month = Some(v);
                } else {
                    day = Some(v);
                }
            }
            Part::MonthFull | Part::MonthShort => {
                let names = if matches!(part, Part::MonthFull) {
                    MONTHS_FULL
                } else {
                    MONTHS_SHORT
                };
                let rest: String = chars.clone().map(|(_, c)| c).collect();
                let name = names.iter().find(|n| rest.starts_with(**n))?;
                let idx = names.iter().position(|n| n == name)? as u32 + 1;
                for _ in name.chars() {
                    chars.next();
                }
                month = Some(idx);
            }
            Part::Skip => {
                // Consume a single alphanumeric word (weekday name, time).
                while let Some(&(_, c)) = chars.peek() {
                    if c.is_alphanumeric() {
                        chars.next();
                    } else {
                        break;
                    }
                }
            }
        }
    }
    if chars.peek().is_some() {
        return None;
    }
    let y = year?;
    let m = month?;
    let d = day?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some((y, m, d))
}

/// Count words in note content (whitespace-delimited tokens).
fn count_words(content: &str) -> u32 {
    content.split_whitespace().count() as u32
}

/// Count unfinished tasks in note content — any checkbox not Done/Cancelled
/// (basalt-task status grammar: `[ ]` Todo, `[/]` InProgress, `[?]` OnHold).
fn count_unfinished_tasks(content: &str) -> u32 {
    let mut n = 0u32;
    for line in content.lines() {
        let trimmed = line.trim_start();
        let Some(rest) = trimmed.strip_prefix(['-', '*', '+']) else {
            continue;
        };
        let rest = rest.trim_start();
        if !rest.starts_with('[') {
            continue;
        }
        let Some(close) = rest.find(']') else {
            continue;
        };
        if close != 2 {
            continue; // only `[x]`-width checkboxes count
        }
        let c = rest.chars().nth(1).unwrap_or(' ');
        let status = status_from_symbol(c);
        if !matches!(
            status,
            TaskStatus::Done | TaskStatus::Cancelled
        ) {
            n += 1;
        }
    }
    n
}

/// Recursively walk a directory and collect `.md` file paths.
fn walk_md_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) -> std::io::Result<()> {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(e) => e,
            Err(_) => continue, // unreadable dir → skip
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                out.push(path);
            }
        }
    }
    Ok(())
}

/// Scan the daily-notes folder and return per-day activity for one month,
/// keyed by `YYYY-MM-DD` (local dates).
#[tauri::command]
pub fn calendar_activity(
    parent: Option<String>,
    date_format: String,
    year: i32,
    month: u32,
    state: State<AppState>,
) -> AppResult<HashMap<String, DayActivity>> {
    let vault_root = canonical_vault_path(&state)?;
    let parent_dir = resolve_parent_dir(&vault_root, parent.as_deref())?;

    let parts = compile_format(&date_format);

    let mut files: Vec<std::path::PathBuf> = Vec::new();
    walk_md_files(&parent_dir, &mut files).map_err(|e| {
        crate::error::AppError::Io(format!("failed to scan daily folder: {e}"))
    })?;

    let mut result: HashMap<String, DayActivity> = HashMap::with_capacity(31);
    for file in files {
        // Match against the full relative path (no extension) so slash-based
        // formats like `YYYY/MM/DD` resolve folders: `2026/09/07.md` → `2026/09/07`.
        let Ok(rel) = file.strip_prefix(&parent_dir) else {
            continue;
        };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let rel = rel.trim_end_matches(".md");
        let Some((y, m, d)) = match_date(rel, &parts) else {
            continue;
        };
        if y != year || m != month {
            continue;
        }

        let content = match std::fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue, // vanished mid-scan
        };

        let key = format!("{year:04}-{month:02}-{d:02}");
        let entry = result.entry(key).or_default();
        entry.exists = true;
        entry.word_count = count_words(&content);
        entry.unfinished_tasks = count_unfinished_tasks(&content);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_iso_format() {
        let parts = compile_format("YYYY-MM-DD");
        assert_eq!(
            parts,
            vec![
                Part::YearDigits(4),
                Part::Literal('-'),
                Part::MonthNum,
                Part::Literal('-'),
                Part::DayNum,
            ]
        );
    }

    #[test]
    fn matches_iso_stems_leniently() {
        let parts = compile_format("YYYY-MM-DD");
        assert_eq!(match_date("2026-09-07", &parts), Some((2026, 9, 7)));
        // 1-digit month/day are accepted — same note created under an old
        // YYYY-M-D format still resolves to the correct date.
        assert_eq!(match_date("2026-9-7", &parts), Some((2026, 9, 7)));
    }

    #[test]
    fn matches_exact_width_with_literals() {
        let parts = compile_format("YYYY-MM-DD");
        // Trailing content and out-of-range dates are rejected.
        assert_eq!(match_date("2026-09-07-extra", &parts), None);
        assert_eq!(match_date("2026-13-40", &parts), None);
    }

    #[test]
    fn matches_nested_slash_format() {
        let parts = compile_format("YYYY/MM/DD");
        // Relative paths (folders from slashes) match, bare stems don't.
        assert_eq!(match_date("2026/09/07", &parts), Some((2026, 9, 7)));
        assert_eq!(match_date("2026/September", &parts), None);
    }

    #[test]
    fn matches_named_month() {
        let parts = compile_format("YYYY-MMMM-DD");
        assert_eq!(match_date("2026-September-07", &parts), Some((2026, 9, 7)));
        let parts = compile_format("YYYY-MMM-DD");
        assert_eq!(match_date("2026-Sep-07", &parts), Some((2026, 9, 7)));
    }

    #[test]
    fn matches_two_digit_year() {
        let parts = compile_format("YY-MM-DD");
        assert_eq!(match_date("26-09-07", &parts), Some((2026, 9, 7)));
        assert_eq!(match_date("86-09-07", &parts), Some((1986, 9, 7)));
    }

    #[test]
    fn ignores_nonmatching_files() {
        let parts = compile_format("YYYY-MM-DD");
        assert_eq!(match_date("README", &parts), None);
        assert_eq!(match_date("2026-09", &parts), None);
    }

    #[test]
    fn skips_weekday_and_extra_literals() {
        let parts = compile_format("ddd, MMM D YYYY");
        assert_eq!(match_date("Mon, Sep 7 2026", &parts), Some((2026, 9, 7)));
    }

    #[test]
    fn format_without_date_tokens_never_matches() {
        let parts = compile_format("YYYY-[Q]1");
        assert_eq!(match_date("2026-Q1", &parts), None); // no month/day tokens
    }

    #[test]
    fn counts_words() {
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("hello world\n\nfoo  bar"), 4);
    }

    #[test]
    fn counts_unfinished_tasks() {
        assert_eq!(count_unfinished_tasks("- [ ] todo"), 1);
        assert_eq!(count_unfinished_tasks("- [x] done\n- [ ] todo"), 1);
        assert_eq!(count_unfinished_tasks("- [/] in progress"), 1);
        assert_eq!(count_unfinished_tasks("- [x] done\n+ [-] cancelled"), 0);
        assert_eq!(count_unfinished_tasks("plain text"), 0);
        assert_eq!(count_unfinished_tasks("- [ ] todo\n- [ ] another"), 2);
    }
}