use basalt_types::QueryResult;
use tauri::State;

use crate::AppState;

/// Execute a DQL query against the vault's indexed metadata.
#[tauri::command]
pub fn run_query(dql: String, _path: String, state: State<'_, AppState>) -> Result<QueryResult, String> {
    let vault = state.vault.read().map_err(|e| format!("Lock error: {}", e))?;
    basalt_tables::execute_query(&vault, &dql)
}