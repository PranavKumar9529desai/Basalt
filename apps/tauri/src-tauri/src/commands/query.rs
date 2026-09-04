use basalt_types::QueryResult;
use tauri::State;

use crate::app_state::AppState;
use crate::error::AppError;

/// Execute a DQL query against the vault's indexed metadata.
#[tauri::command]
pub fn run_query(
    dql: String,
    _path: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    basalt_tables::execute_query(&vault, &dql).map_err(|e| AppError::Query(e.to_string()))
}
