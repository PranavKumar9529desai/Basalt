//! Task management Tauri commands (ADR-048).
//!
//! Provides IPC for querying, toggling, creating, and editing tasks.
//! The DQL `TASK` query type dispatches to the same `execute_task_query`
//! engine used by `get_tasks`.

use std::path::Path;

use basalt_tables::{QueryResult, TaskQuery};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{canonical_md_path, index_upsert, register_self_writes};

// ---------------------------------------------------------------------------
// get_tasks — query all tasks with optional filters/sorts
// ---------------------------------------------------------------------------

/// Query tasks across the vault. When `query` is None, returns all tasks
/// sorted by urgency descending.
#[tauri::command]
pub fn get_tasks(query: Option<TaskQuery>, state: State<'_, AppState>) -> AppResult<QueryResult> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    basalt_tables::execute_task_query(&vault, query.as_ref())
        .map_err(|e| AppError::Query(e.to_string()))
}

// ---------------------------------------------------------------------------
// toggle_task — cycle task status on a checkbox line
// ---------------------------------------------------------------------------

/// The default status cycle: `todo → done → cancelled → todo`.
/// This matches Obsidian Tasks semantics.
const DEFAULT_STATUS_CYCLE: &[&str] = &["todo", "done", "cancelled"];

/// Toggle a task's status on a specific line of a markdown file.
/// Reads the file, finds the line at `line_number` (1-indexed), cycles its
/// checkbox status, writes back, and re-indexes.
///
/// Returns the new status string after toggling.
#[tauri::command]
pub fn toggle_task(path: String, line_number: usize, state: State<AppState>) -> AppResult<String> {
    let abs = canonical_md_path(&path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let lines: Vec<&str> = content.lines().collect();
    if line_number == 0 || line_number > lines.len() {
        return Err(AppError::Validation(format!(
            "line {line_number} out of range (1–{})",
            lines.len()
        )));
    }

    let line = lines[line_number - 1];

    // Parse current status from checkbox: `- [x]`, `- [ ]`, `- [-]`, etc.
    let (before, status_char, after) = parse_checkbox_line(line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    let current_status = checkbox_char_to_status(status_char);
    let next_status = cycle_status(&current_status);
    let next_char = status_to_checkbox_char(&next_status);

    // Reconstruct line
    let new_line = format!("{before}[{next_char}]{after}");
    let mut new_lines: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
    new_lines[line_number - 1] = new_line;
    let new_content = new_lines.join("\n");

    write_and_reindex(&abs, &new_content, &path, &state)?;

    Ok(next_status)
}

// ---------------------------------------------------------------------------
// create_task — append a task checkbox to a file
// ---------------------------------------------------------------------------

/// Input for creating a new task.
#[derive(Deserialize)]
pub struct CreateTaskInput {
    /// Path of the file to append the task to.
    pub path: String,
    /// Task description text.
    pub description: String,
    /// Optional priority signifier: "highest", "high", "medium", "low", "lowest".
    #[serde(default)]
    pub priority: Option<String>,
    /// Optional due date (YYYY-MM-DD).
    #[serde(default)]
    pub due: Option<String>,
    /// Optional scheduled date (YYYY-MM-DD).
    #[serde(default)]
    pub scheduled: Option<String>,
    /// Optional recurrence rule string (e.g., "every week", "every 3 days").
    #[serde(default)]
    pub recurrence: Option<String>,
    /// Optional tags (without # prefix).
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

/// Create a new task by appending a checkbox line to a markdown file.
/// Returns the line number (1-indexed) of the newly created task.
#[tauri::command]
pub fn create_task(input: CreateTaskInput, state: State<AppState>) -> AppResult<usize> {
    let abs = canonical_md_path(&input.path)?;
    let mut content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    // Build the task line
    let task_line = build_task_line(&input);

    // Ensure file ends with newline before appending
    if !content.ends_with('\n') {
        content.push('\n');
    }

    let line_number = content.lines().count() + 1;
    content.push_str(&task_line);
    content.push('\n');

    write_and_reindex(&abs, &content, &input.path, &state)?;

    Ok(line_number)
}

// ---------------------------------------------------------------------------
// update_task — modify an existing task's signifiers
// ---------------------------------------------------------------------------

/// Input for updating a task.
#[derive(Deserialize)]
pub struct UpdateTaskInput {
    /// Path of the file containing the task.
    pub path: String,
    /// 1-indexed line number of the task.
    pub line_number: usize,
    /// New description (optional; replaces existing).
    #[serde(default)]
    pub description: Option<String>,
    /// New status: "todo", "done", "cancelled", "in_progress", etc.
    #[serde(default)]
    pub status: Option<String>,
    /// New priority signifier.
    #[serde(default)]
    pub priority: Option<String>,
    /// New due date (YYYY-MM-DD or empty string to clear).
    #[serde(default)]
    pub due: Option<String>,
    /// New scheduled date.
    #[serde(default)]
    pub scheduled: Option<String>,
    /// New recurrence rule.
    #[serde(default)]
    pub recurrence: Option<String>,
    /// New tags.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

/// Update a task's signifiers on a specific line.
/// Rebuilds the line from scratch using the new values, preserving the
/// checkbox character from the current status (unless `status` is explicitly
/// provided).
#[tauri::command]
pub fn update_task(input: UpdateTaskInput, state: State<AppState>) -> AppResult<()> {
    let abs = canonical_md_path(&input.path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let lines: Vec<&str> = content.lines().collect();
    if input.line_number == 0 || input.line_number > lines.len() {
        return Err(AppError::Validation(format!(
            "line {} out of range (1–{})",
            input.line_number,
            lines.len()
        )));
    }

    let old_line = lines[input.line_number - 1];

    // Parse existing line to extract current values
    let (indent, status_char, existing_desc, existing_signifiers) =
        parse_task_line_parts(old_line)
            .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    // Determine new values (fall back to existing)
    let new_desc = input.description.unwrap_or_else(|| existing_desc.to_string());
    let new_status = input.status.unwrap_or_else(|| {
        checkbox_char_to_status(status_char)
    });
    let new_priority = input.priority.or(existing_signifiers.priority.map(String::from));
    let new_due = if input.due.as_deref() == Some("") {
        None
    } else {
        input.due.or(existing_signifiers.due.map(String::from))
    };
    let new_scheduled = if input.scheduled.as_deref() == Some("") {
        None
    } else {
        input.scheduled.or(existing_signifiers.scheduled.map(String::from))
    };
    let new_recurrence = if input.recurrence.as_deref() == Some("") {
        None
    } else {
        input.recurrence.or(existing_signifiers.recurrence.map(String::from))
    };
    let new_tags = input.tags.or_else(|| {
        if existing_signifiers.tags.is_empty() {
            None
        } else {
            Some(existing_signifiers.tags.iter().map(|s| s.to_string()).collect())
        }
    });

    // Build new line
    let new_line = build_task_line_from_parts(
        indent,
        &new_status,
        &new_desc,
        new_priority.as_deref(),
        new_due.as_deref(),
        new_scheduled.as_deref(),
        new_recurrence.as_deref(),
        new_tags.as_deref(),
    );

    let mut new_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    new_lines[input.line_number - 1] = new_line;
    let new_content = new_lines.join("\n");

    write_and_reindex(&abs, &new_content, &input.path, &state)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// get_task_line — read a single task line (for modal editing)
// ---------------------------------------------------------------------------

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

/// Read a task line and return its parsed components.
#[tauri::command]
pub fn get_task_line(path: String, line_number: usize) -> AppResult<TaskLineResult> {
    let abs = canonical_md_path(&path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let lines: Vec<&str> = content.lines().collect();
    if line_number == 0 || line_number > lines.len() {
        return Err(AppError::Validation(format!(
            "line {line_number} out of range (1–{})",
            lines.len()
        )));
    }

    let line = lines[line_number - 1];
    let (_indent, status_char, desc, sigs) = parse_task_line_parts(line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    Ok(TaskLineResult {
        raw: line.to_string(),
        status_char,
        description: desc.to_string(),
        signifiers: TaskSignifiers {
            priority: sigs.priority.map(String::from),
            due: sigs.due.map(String::from),
            scheduled: sigs.scheduled.map(String::from),
            start: sigs.start.map(String::from),
            created: sigs.created.map(String::from),
            recurrence: sigs.recurrence.map(String::from),
            tags: sigs.tags.iter().map(|s| s.to_string()).collect(),
        },
    })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parsed signifier references (borrows from the source line).
struct ParsedSignifiers<'a> {
    priority: Option<&'a str>,
    due: Option<&'a str>,
    scheduled: Option<&'a str>,
    start: Option<&'a str>,
    created: Option<&'a str>,
    recurrence: Option<&'a str>,
    tags: Vec<&'a str>,
}

/// Parse a checkbox line into (indent, status_char, description, signifiers).
fn parse_task_line_parts(line: &str) -> Option<(&str, char, &str, ParsedSignifiers<'_>)> {
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
    let description = after_bracket.trim_start();

    // Parse signifiers from description
    let sigs = parse_signifiers_from_desc(description);

    Some((indent, status_char, description, sigs))
}

/// Parse signifiers from the description text.
fn parse_signifiers_from_desc(desc: &str) -> ParsedSignifiers<'_> {
    let mut priority = None;
    let mut due = None;
    let mut scheduled = None;
    let mut start = None;
    let mut created = None;
    let mut recurrence = None;
    let mut tags = Vec::new();

    // Simple tokenizer: split by whitespace and check prefixes
    for token in desc.split_whitespace() {
        if token.starts_with("🔺") || token == "p0" {
            priority = Some("highest");
        } else if token.starts_with("🔴") || token == "p1" {
            priority = Some("high");
        } else if token.starts_with("🟡") || token == "p2" {
            priority = Some("medium");
        } else if token.starts_with("🔵") || token == "p3" {
            priority = Some("low");
        } else if token.starts_with("最低") || token == "p4" {
            priority = Some("lowest");
        } else if let Some(date) = token.strip_prefix("📅") {
            due = Some(date);
        } else if let Some(date) = token.strip_prefix("🛫") {
            scheduled = Some(date);
        } else if let Some(date) = token.strip_prefix("⏳") {
            start = Some(date);
        } else if let Some(date) = token.strip_prefix("➕") {
            created = Some(date);
        } else if let Some(rule) = token.strip_prefix("🔁") {
            recurrence = Some(rule);
        } else if token.starts_with('#') {
            tags.push(token);
        }
    }

    ParsedSignifiers {
        priority,
        due,
        scheduled,
        start,
        created,
        recurrence,
        tags,
    }
}

/// Parse a checkbox line: returns (before_bracket, status_char, after_bracket).
fn parse_checkbox_line(line: &str) -> Option<(&str, char, &str)> {
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

/// Map checkbox character to status name.
fn checkbox_char_to_status(c: char) -> String {
    match c {
        'x' | 'X' => "done".to_string(),
        ' ' => "todo".to_string(),
        '-' => "cancelled".to_string(),
        '/' => "in_progress".to_string(),
        '>' => "deferred".to_string(),
        _ => "todo".to_string(),
    }
}

/// Map status name to checkbox character.
fn status_to_checkbox_char(status: &str) -> char {
    match status {
        "done" => 'x',
        "todo" => ' ',
        "cancelled" => '-',
        "in_progress" => '/',
        "deferred" => '>',
        _ => ' ',
    }
}

/// Cycle to next status in the default cycle.
fn cycle_status(current: &str) -> String {
    let idx = DEFAULT_STATUS_CYCLE
        .iter()
        .position(|s| *s == current)
        .unwrap_or(0);
    let next = (idx + 1) % DEFAULT_STATUS_CYCLE.len();
    DEFAULT_STATUS_CYCLE[next].to_string()
}

/// Build a complete task checkbox line from input.
fn build_task_line(input: &CreateTaskInput) -> String {
    let priority_signifier = input.priority.as_deref().map(priority_to_signifier).unwrap_or_default();
    let due_signifier = input
        .due
        .as_ref()
        .map(|d| format!(" 📅{d}"))
        .unwrap_or_default();
    let scheduled_signifier = input
        .scheduled
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
        "- [ ] {}{}{}{}{}{}",
        input.description, priority_signifier, due_signifier, scheduled_signifier,
        recurrence_signifier, tags_str,
    )
}

/// Build a task line from individual parts.
fn build_task_line_from_parts(
    indent: &str,
    status: &str,
    description: &str,
    priority: Option<&str>,
    due: Option<&str>,
    scheduled: Option<&str>,
    recurrence: Option<&str>,
    tags: Option<&[String]>,
) -> String {
    let status_char = status_to_checkbox_char(status);
    let priority_sig = priority.map(priority_to_signifier).unwrap_or_default();
    let due_sig = due.map(|d| format!(" 📅{d}")).unwrap_or_default();
    let scheduled_sig = scheduled
        .map(|d| format!(" 🛫{d}"))
        .unwrap_or_default();
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
        "{indent}- [{status_char}] {description}{priority_sig}{due_sig}{scheduled_sig}{recurrence_sig}{tags_str}"
    )
}

/// Map priority name to signifier string.
fn priority_to_signifier(priority: &str) -> String {
    match priority {
        "highest" => " 🔺".to_string(),
        "high" => " 🔴".to_string(),
        "medium" => " 🟡".to_string(),
        "low" => " 🔵".to_string(),
        "lowest" => " ⬇️".to_string(),
        _ => String::new(),
    }
}

/// Write content to disk, update vault cache, and re-index.
fn write_and_reindex(
    abs: &Path,
    content: &str,
    path: &str,
    state: &AppState,
) -> AppResult<()> {
    // Register self-write before touching disk
    register_self_writes(state, &[abs.to_path_buf()]);

    std::fs::write(abs, content)
        .map_err(|e| AppError::Io(format!("failed to write file: {e}")))?;

    // Update vault cache
    let mut vault = state
        .vault
        .write()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    vault.add_document(path, content);
    drop(vault);

    // Update search index
    index_upsert(state, path, content);

    Ok(())
}
