//! Task management Tauri commands (ADR-048).
//!
//! Provides IPC for querying, toggling, creating, and editing tasks.
//! The DQL `TASK` query type dispatches to the same `execute_task_query`
//! engine used by `get_tasks`.
//!
//! This module is split by concern:
//! - [`line`] — checkbox-line parsing + IPC result shapes
//! - [`signifiers`] — emoji/date/recurrence signifier parsing + status maps
//! - [`serializer`] — building task lines from input structs

pub mod line;
pub mod serializer;
pub mod signifiers;

use std::path::Path;

use basalt_tables::{QueryResult, TaskQuery};
use serde::Deserialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{canonical_md_path, index_upsert, register_self_writes};
use line::{parse_checkbox_line, parse_task_line_parts, TaskLineResult, TaskSignifiers};
use serializer::{build_task_line, build_task_line_from_parts, TaskLineParts};
use signifiers::{checkbox_char_to_status, cycle_status, status_to_checkbox_char};

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
    /// Optional start date (YYYY-MM-DD).
    #[serde(default)]
    pub start: Option<String>,
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
    let (indent, status_char, existing_desc, existing_signifiers) = parse_task_line_parts(old_line)
        .ok_or_else(|| AppError::Validation("line is not a task checkbox".into()))?;

    // Determine new values (fall back to existing)
    let new_desc = input
        .description
        .unwrap_or_else(|| existing_desc.to_string());
    let new_status = input
        .status
        .unwrap_or_else(|| checkbox_char_to_status(status_char));
    let new_priority = input
        .priority
        .or(existing_signifiers.priority.map(String::from));
    let new_due = if input.due.as_deref() == Some("") {
        None
    } else {
        input.due.or(existing_signifiers.due.map(String::from))
    };
    let new_scheduled = if input.scheduled.as_deref() == Some("") {
        None
    } else {
        input
            .scheduled
            .or(existing_signifiers.scheduled.map(String::from))
    };
    let new_start = if input.start.as_deref() == Some("") {
        None
    } else {
        input.start.or(existing_signifiers.start.map(String::from))
    };
    let new_recurrence = if input.recurrence.as_deref() == Some("") {
        None
    } else {
        input
            .recurrence
            .or(existing_signifiers.recurrence.map(String::from))
    };
    let new_tags = input.tags.or_else(|| {
        if existing_signifiers.tags.is_empty() {
            None
        } else {
            Some(
                existing_signifiers
                    .tags
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            )
        }
    });

    // Build new line
    let new_line = build_task_line_from_parts(TaskLineParts {
        indent,
        status: &new_status,
        description: &new_desc,
        priority: new_priority.as_deref(),
        due: new_due.as_deref(),
        scheduled: new_scheduled.as_deref(),
        start: new_start.as_deref(),
        recurrence: new_recurrence.as_deref(),
        tags: new_tags.as_deref(),
    });

    let mut new_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    new_lines[input.line_number - 1] = new_line;
    let new_content = new_lines.join("\n");

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
// Shared write path
// ---------------------------------------------------------------------------

/// Write content to disk, update vault cache, and re-index.
fn write_and_reindex(abs: &Path, content: &str, path: &str, state: &AppState) -> AppResult<()> {
    // Register self-write before touching disk
    register_self_writes(state, &[abs.to_path_buf()]);

    std::fs::write(abs, content).map_err(|e| AppError::Io(format!("failed to write file: {e}")))?;

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
