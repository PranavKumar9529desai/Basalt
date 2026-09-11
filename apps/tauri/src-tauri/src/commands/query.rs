use basalt_types::QueryResult;
use tauri::State;

use crate::app_state::AppState;
use crate::error::AppError;

/// Execute a DQL query against the vault's indexed metadata.
///
/// Runs off the main thread (ADR-046): a synchronous `#[tauri::command]`
/// blocks the WebView renderer on Linux WebKitGTK for the duration of the
/// query — the same freeze mode DQL blocks shared with task blocks before
/// the async migration.
#[tauri::command]
pub async fn run_query(
    dql: String,
    _path: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, AppError> {
    let vault = state.vault.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = vault.read().map_err(|_| AppError::LockPoisoned("vault"))?;
        basalt_tables::execute_query(&guard, &dql).map_err(|e| AppError::Query(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Io(format!("dql query task failed: {e}")))?
}
