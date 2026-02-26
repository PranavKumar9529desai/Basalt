mod app_state;
mod cache;
mod commands;
mod config;
mod watcher;
mod workspace;

pub use app_state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::boot,
            commands::set_vault,
            commands::set_setting,
            commands::get_settings,
            commands::reindex_vault,
            commands::get_vault_tree,
            commands::open_vault_dialog,
            commands::open_file,
            commands::save_file,
            commands::get_backlinks,
            commands::autocomplete_links,
            commands::autocomplete_tags,
            commands::get_workspace,
            commands::set_workspace_key,
            commands::create_note,
            commands::create_folder,
            commands::delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
