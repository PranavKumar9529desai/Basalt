//! Daily notes "core plugin" (ADR-036): idempotent open-or-create of a
//! date-named note.
//!
//! The frontend computes the date filename from the user's format string and
//! expands the daily template (see `features/templates/lib/`), then calls
//! `open_daily_note` with the already-rendered (parent, name, content). This
//! command only resolves the path safely and creates-if-missing — it never
//! formats dates itself (single template/date implementation lives in TS).

use std::path::Path;

use tauri::State;

use crate::app_state::AppState;
use crate::commands::common::{resolve_parent_dir, write_markdown_note};
use crate::commands::notes::CreateNoteResult;
use crate::error::{AppError, AppResult};

/// Open today's note, creating it (with `content`) when it doesn't exist.
/// `name` is the date-rendered filename and may contain `/` segments for
/// nested folders (e.g. `2026/March/2026-Mar-08` from a format with slashes).
pub fn open_or_create_note_impl(
    state: &AppState,
    parent: Option<String>,
    name: String,
    content: String,
) -> AppResult<CreateNoteResult> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault_root = Path::new(&vault_path_str)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)?;

    let parent_dir = resolve_parent_dir(&vault_root, parent.as_deref())?;

    // Exists → open as-is (idempotent; never re-apply the template).
    let (_, file_path, file_name) =
        basalt_vault::path_utils::resolve_creation_path(&parent_dir, None, &name, false)?;
    let clean_name = file_name.trim_end_matches(".md").to_string();
    if file_path.exists() {
        let abs = file_path
            .canonicalize()
            .map_err(|e| AppError::Io(format!("canonicalize failed: {e}")))?
            .to_string_lossy()
            .to_string();
        return Ok(CreateNoteResult {
            path: abs,
            name: clean_name,
        });
    }

    let (abs_path, created_name) = write_markdown_note(state, &parent_dir, &name, &content)?;
    Ok(CreateNoteResult {
        path: abs_path.to_string_lossy().to_string(),
        name: created_name,
    })
}

#[tauri::command]
pub fn open_daily_note(
    parent: Option<String>,
    name: String,
    content: String,
    state: State<AppState>,
) -> AppResult<CreateNoteResult> {
    open_or_create_note_impl(&state, parent, name, content)
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::app_state::AppState;

    use super::open_or_create_note_impl;

    fn temp_vault() -> (std::path::PathBuf, AppState) {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("basalt-dailies-test-{n}"));
        std::fs::create_dir_all(&root).unwrap();
        let state = AppState::default();
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
        (root, state)
    }

    fn abs_of(root: &std::path::Path, rel: &str) -> String {
        root.join(rel)
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn creates_daily_note_with_content_when_missing() {
        let (root, state) = temp_vault();
        let res = open_or_create_note_impl(
            &state,
            Some("Daily".to_string()),
            "2026-09-07".to_string(),
            "# 2026-09-07\n\n## Focus\n".to_string(),
        )
        .unwrap();

        assert_eq!(res.name, "2026-09-07");
        assert_eq!(res.path, abs_of(&root, "Daily/2026-09-07.md"));
        assert_eq!(
            std::fs::read_to_string(root.join("Daily/2026-09-07.md")).unwrap(),
            "# 2026-09-07\n\n## Focus\n"
        );
    }

    #[test]
    fn open_is_idempotent_and_never_overwrites() {
        let (root, state) = temp_vault();
        let first = open_or_create_note_impl(
            &state,
            Some("Daily".to_string()),
            "2026-09-07".to_string(),
            "# version 1\n".to_string(),
        )
        .unwrap();
        let second = open_or_create_note_impl(
            &state,
            Some("Daily".to_string()),
            "2026-09-07".to_string(),
            "# overwritten?\n".to_string(),
        )
        .unwrap();

        assert_eq!(first.path, second.path);
        assert_eq!(
            std::fs::read_to_string(root.join("Daily/2026-09-07.md")).unwrap(),
            "# version 1\n"
        );
    }

    #[test]
    fn nested_format_creates_subfolders() {
        let (root, state) = temp_vault();
        let res = open_or_create_note_impl(
            &state,
            Some("Daily".to_string()),
            "2026/March/2026-Mar-08".to_string(),
            String::new(),
        )
        .unwrap();

        assert_eq!(res.name, "2026-Mar-08");
        assert_eq!(res.path, abs_of(&root, "Daily/2026/March/2026-Mar-08.md"));
        assert!(root.join("Daily/2026/March/2026-Mar-08.md").is_file());
    }

    #[test]
    fn rejects_traversal_parent() {
        let (root, state) = temp_vault();
        let res = open_or_create_note_impl(
            &state,
            Some("../escape".to_string()),
            "2026-09-07".to_string(),
            String::new(),
        );
        match res {
            Err(e) => assert!(e.to_string().contains(".."), "unexpected error: {e}"),
            Ok(_) => panic!("traversal parent must be rejected"),
        }
        assert!(!root.join("..").join("escape").is_dir());
    }
}
