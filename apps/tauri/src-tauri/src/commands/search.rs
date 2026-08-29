use basalt_types::{FileMatch, FileResult, SearchContentResult};
use tauri::State;

use crate::app_state::AppState;

#[tauri::command]
pub fn search_content(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<SearchContentResult, String> {
    // Write lock: the query flushes pending index updates first.
    let mut search = state
        .search
        .write()
        .map_err(|_| "search lock poisoned".to_string())?;
    let search = search
        .as_mut()
        .ok_or_else(|| "search index not ready".to_string())?;
    Ok(search.search_content(&query, limit.unwrap_or(20)))
}

/// Uses write lock because nucleo-matcher's Matcher::score takes &mut self.
#[tauri::command]
pub fn search_files(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<FileResult>, String> {
    let mut search = state
        .search
        .write()
        .map_err(|_| "search lock poisoned".to_string())?;
    let search = search
        .as_mut()
        .ok_or_else(|| "search index not ready".to_string())?;
    Ok(search.search_files(&query, limit.unwrap_or(10)))
}
