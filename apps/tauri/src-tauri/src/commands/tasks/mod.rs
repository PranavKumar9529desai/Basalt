//! Task management Tauri commands (ADR-048).
//!
//! Thin IPC wrappers over the `basalt-task` domain crate. Read-modify-write
//! (file I/O, vault cache, reindex) stays here — it is `AppState`/
//! `index_upsert` territory; the grammar (line parse/serialize, status
//! cycle, priority maps) lives in `basalt-task`.
//!
//! The `get_tasks` (task query) command delegates to
//! `basalt_task::query::execute_task_query`, which `basalt-tables`
//! re-exports for the DQL `TASK` branch — both surfaces share the wire
//! shapes defined here.

use std::path::Path;

use basalt_task::{
    build_task_line, next_in_cycle, parse_task_line, priority_from_name, status_from_name,
    status_symbol, TaskLineParts, DEFAULT_STATUS_CYCLE,
};
use basalt_tables::{QueryResult, TaskQuery, execute_task_query};
use serde::Deserialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{canonical_md_path, index_upsert, register_self_writes};

// ---------------------------------------------------------------------------
// Wire shapes (IPC contract — stays byte-identical for the frontend)
// ---------------------------------------------------------------------------

/// Result of reading a task line.
#[derive(serde::Serialize)]
pub struct TaskLineResult {
    /// The full raw line text.
    pub raw: String,
    /// Checkbox status character: 'x', ' ', '-', '/', '?', etc.
    pub status_char: char,
    /// Description text (without signifiers).
    pub description: String,
    /// Parsed signifiers.
    pub signifiers: TaskSignifiers,
}

/// Parsed signifiers from a task line, as wire strings.
#[derive(serde::Serialize, Default)]
pub struct TaskSignifiers {
    pub priority: Option<String>,
    pub created: Option<String>,
    pub due: Option<String>,
    pub scheduled: Option<String>,
    pub start: Option<String>,
    pub done: Option<String>,
    pub cancelled: Option<String>,
    pub recurrence: Option<String>,
    pub id: Option<String>,
    pub depends_on: Vec<String>,
    pub on_completion: Option<String>,
    pub tags: Vec<String>,
}

/// Input for creating a new task.
#[derive(Deserialize)]
pub struct CreateTaskInput {
    /// Path of the file to append the task to.
    pub path: String,
    /// Task description text.
    pub description: String,
    /// Optional priority: "highest" | "high" | "medium" | "none" | "low" |
    /// "lowest". "none" and unknown values omit the signifier.
    #[serde(default)]
    pub priority: Option<String>,
    /// Optional due date (YYYY-MM-DD).
    #[serde(default)]
    pub due: Option<String>,
    /// Optional scheduled date (YYYY-MM-DD).
    #[serde(default)]
    pub scheduled: Option<String>,
    /// Optional start date (YYYY-MM-DD).
    #[serde(default)]
    pub start: Option<String>,
    /// Optional recurrence rule string (e.g., "every week", "every 3 days").
    #[serde(default)]
    pub recurrence: Option<String>,
    /// Optional tags (with or without # prefix).
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

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
    /// New status: "todo", "done", "cancelled", "in_progress", "on_hold".
    #[serde(default)]
    pub status: Option<String>,
    /// New priority.
    #[serde(default)]
    pub priority: Option<String>,
    /// New due date (YYYY-MM-DD or empty string to clear).
    #[serde(default)]
    pub due: Option<String>,
    /// New scheduled date.
    #[serde(default)]
    pub scheduled: Option<String>,
    /// New start date.
    #[serde(default)]
    pub start: Option<String>,
    /// New recurrence rule.
    #[serde(default)]
    pub recurrence: Option<String>,
    /// New tags.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

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
    execute_task_query(&vault, query.as_ref())
        .map_err(|e| AppError::Query(e.to_string()))
}

// ---------------------------------------------------------------------------
// toggle_task — cycle task status on a checkbox line
// ---------------------------------------------------------------------------

/// Toggle a task's status on a specific line of a markdown file.
/// Reads the file, finds the line at `line_number` (1-indexed), advances
/// its checkbox status through the cycle, writes back, and re-indexes.
///
/// `status_sequence` is optional and mirrors the `tasksStatusSequence`
/// setting ("in_progress,done" → `[ ] → [/] → [x] → [ ]`); when absent the
/// default cycle is used. Returns the new status name.
#[tauri::command]
pub fn toggle_task(
    path: String,
    line_number: usize,
    status_sequence: Option<Vec<String>>,
    state: State<AppState>,
) -> AppResult<String> {
    let abs = canonical_md_path(&path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let line = line_at(&content, line_number)?;
    let parsed = parse_task_line(line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    let cycle = match status_sequence {
        Some(names) => {
            let mut cycle = Vec::with_capacity(names.len());
            for name in &names {
                let status = status_from_name(name).ok_or_else(|| {
                    AppError::Validation(format!("unknown status in sequence: {name}"))
                })?;
                cycle.push(status);
            }
            cycle
        }
        None => DEFAULT_STATUS_CYCLE.to_vec(),
    };
    let next = next_in_cycle(parsed.status, &cycle);

    let depends_on: Vec<String> = parsed
        .signifiers
        .depends_on
        .iter()
        .map(|s| s.to_string())
        .collect();
    let new_line = replace_line(&content, line_number, &build_task_line(&TaskLineParts {
        indent: parsed.indent,
        status: next,
        description: &parsed.description,
        priority: parsed.signifiers.priority,
        created: parsed.signifiers.created,
        due: parsed.signifiers.due,
        scheduled: parsed.signifiers.scheduled,
        start: parsed.signifiers.start,
        done: parsed.signifiers.done,
        cancelled: parsed.signifiers.cancelled,
        recurrence: parsed.signifiers.recurrence.as_deref(),
        id: parsed.signifiers.id,
        depends_on: &depends_on,
        on_completion: parsed.signifiers.on_completion,
        tags: None,
    }));

    write_and_reindex(&abs, &new_line, &path, &state)?;

    Ok(next.name().to_string())
}

// ---------------------------------------------------------------------------
// create_task — append a task checkbox to a file
// ---------------------------------------------------------------------------

/// Create a new task by appending a checkbox line to a markdown file.
/// Returns the line number (1-indexed) of the newly created task.
#[tauri::command]
pub fn create_task(input: CreateTaskInput, state: State<AppState>) -> AppResult<usize> {
    let abs = canonical_md_path(&input.path)?;
    let mut content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let task_line = build_task_line(&TaskLineParts {
        indent: "",
        status: basalt_types::TaskStatus::Todo,
        description: &input.description.trim(),
        priority: input.priority.as_deref().and_then(priority_from_name),
        created: None,
        due: input.due.as_deref().filter(|s| !s.is_empty()),
        scheduled: input.scheduled.as_deref().filter(|s| !s.is_empty()),
        start: input.start.as_deref().filter(|s| !s.is_empty()),
        done: None,
        cancelled: None,
        recurrence: input.recurrence.as_deref().filter(|s| !s.is_empty()),
        id: None,
        depends_on: &[],
        on_completion: None,
        tags: stripped_tags(input.tags.as_deref()).as_deref(),
    });

    // Ensure file ends with newline before appending.
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

/// Update a task's signifiers on a specific line.
/// Rebuilds the line from scratch using the new values, preserving the
/// existing checkbox character/status unless `status` is explicitly
/// provided, and preserving the signifiers the modal does not edit
/// (created/done/cancelled dates, id, dependencies, on-completion).
#[tauri::command]
pub fn update_task(input: UpdateTaskInput, state: State<AppState>) -> AppResult<()> {
    let abs = canonical_md_path(&input.path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let old_line = line_at(&content, input.line_number)?;
    let parsed = parse_task_line(old_line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    let new_status = match input.status.as_deref() {
        Some(name) => status_from_name(name).ok_or_else(|| {
            AppError::Validation(format!("unknown status: {name}"))
        })?,
        None => parsed.status,
    };
    let new_priority = input
        .priority
        .as_deref()
        .and_then(priority_from_name)
        .or(parsed.signifiers.priority);
    let new_desc = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&parsed.description);

    let depends_on: Vec<String> = parsed
        .signifiers
        .depends_on
        .iter()
        .map(|s| s.to_string())
        .collect();
    let new_line = build_task_line(&TaskLineParts {
        indent: parsed.indent,
        status: new_status,
        description: new_desc,
        priority: new_priority,
        created: parsed.signifiers.created,
        due: clearable(input.due.as_deref(), parsed.signifiers.due),
        scheduled: clearable(input.scheduled.as_deref(), parsed.signifiers.scheduled),
        start: clearable(input.start.as_deref(), parsed.signifiers.start),
        done: parsed.signifiers.done,
        cancelled: parsed.signifiers.cancelled,
        recurrence: clearable(
            input.recurrence.as_deref(),
            parsed.signifiers.recurrence.as_deref(),
        ),
        id: parsed.signifiers.id,
        depends_on: &depends_on,
        on_completion: parsed.signifiers.on_completion,
        tags: stripped_tags(input.tags.as_deref())
            .or_else(|| non_empty_tags(&parsed.signifiers.tags))
            .as_deref(),
    });

    let new_content = replace_line(&content, input.line_number, &new_line);

    write_and_reindex(&abs, &new_content, &input.path, &state)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// get_task_line — read a single task line (for modal editing)
// ---------------------------------------------------------------------------

/// Read a task line and return its parsed components.
#[tauri::command]
pub fn get_task_line(path: String, line_number: usize) -> AppResult<TaskLineResult> {
    let abs = canonical_md_path(&path)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read file: {e}")))?;

    let line = line_at(&content, line_number)?;
    let parsed = parse_task_line(line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    Ok(TaskLineResult {
        raw: line.to_string(),
        status_char: status_symbol(parsed.status),
        description: parsed.description.clone(),
        signifiers: TaskSignifiers {
            priority: parsed.signifiers.priority.map(|p| p.name().to_string()),
            created: parsed.signifiers.created.map(String::from),
            due: parsed.signifiers.due.map(String::from),
            scheduled: parsed.signifiers.scheduled.map(String::from),
            start: parsed.signifiers.start.map(String::from),
            done: parsed.signifiers.done.map(String::from),
            cancelled: parsed.signifiers.cancelled.map(String::from),
            recurrence: parsed.signifiers.recurrence.clone(),
            id: parsed.signifiers.id.map(String::from),
            depends_on: parsed
                .signifiers
                .depends_on
                .iter()
                .map(|s| s.to_string())
                .collect(),
            on_completion: parsed.signifiers.on_completion.map(String::from),
            tags: parsed.signifiers.tags.iter().map(|s| s.to_string()).collect(),
        },
    })
}

// ---------------------------------------------------------------------------
// Shared read/write helpers (CRLF-preserving)
// ---------------------------------------------------------------------------

/// Return the 1-indexed line, validating the range.
fn line_at(content: &str, line_number: usize) -> AppResult<&str> {
    let line = content
        .lines()
        .nth(line_number.checked_sub(1).ok_or_else(|| {
            AppError::Validation(format!("line {line_number} out of range"))
        })?)
        .ok_or_else(|| {
            AppError::Validation(format!(
                "line {line_number} out of range (1–{})",
                content.lines().count()
            ))
        })?;
    Ok(line)
}

/// Replace one content line (1-indexed), preserving the file's line-ending
/// style (`\n` vs `\r\n`) — the scanner handles CRLF; the writers must too.
fn replace_line(content: &str, line_number: usize, new_line: &str) -> String {
    let eol = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let mut out = String::with_capacity(content.len() + new_line.len());
    for (idx, line) in content.lines().enumerate() {
        if idx > 0 {
            out.push_str(eol);
        }
        if idx + 1 == line_number {
            out.push_str(new_line);
        } else {
            out.push_str(line);
        }
    }
    out
}

/// Strip leading `#` from tags (the serializer re-adds it). `None` when no
/// tags are supplied.
fn stripped_tags(tags: Option<&[String]>) -> Option<Vec<String>> {
    tags.map(|t| {
        t.iter()
            .map(|s| s.trim_start_matches('#').to_string())
            .filter(|s| !s.is_empty())
            .collect()
    })
}

/// Tags as `Some(Vec)` only when non-empty (fallback path for update).
fn non_empty_tags(tags: &[&str]) -> Option<Vec<String>> {
    if tags.is_empty() {
        None
    } else {
        Some(tags.iter().map(|s| s.to_string()).collect())
    }
}

/// `input` (with `""` meaning "clear") else the existing value.
fn clearable<'a>(input: Option<&'a str>, existing: Option<&'a str>) -> Option<&'a str> {
    match input {
        Some("") => None,
        Some(v) => Some(v),
        None => existing,
    }
}

/// Write content to disk, update vault cache, and re-index.
fn write_and_reindex(abs: &Path, content: &str, path: &str, state: &AppState) -> AppResult<()> {
    // Register self-write before touching disk.
    register_self_writes(state, &[abs.to_path_buf()]);

    std::fs::write(abs, content).map_err(|e| AppError::Io(format!("failed to write file: {e}")))?;

    // Update vault cache.
    let mut vault = state
        .vault
        .write()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    vault.add_document(path, content);
    drop(vault);

    // Update search index.
    index_upsert(state, path, content);

    Ok(())
}