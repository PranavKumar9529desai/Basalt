mod app_state;
mod cache;
mod commands;
mod config;
mod watcher;
mod workspace;

pub use app_state::AppState;

use commands::{
    autocomplete_links, autocomplete_tags, boot, create_folder, create_note, delete_file,
    delete_paths, get_backlinks, get_settings, get_vault_tree, get_workspace, move_paths,
    open_file, open_vault_dialog, reindex_vault, save_file, search_content, search_files,
    set_setting, set_vault, set_workspace_key,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            boot,
            set_vault,
            set_setting,
            get_settings,
            reindex_vault,
            get_vault_tree,
            open_vault_dialog,
            open_file,
            save_file,
            get_backlinks,
            autocomplete_links,
            autocomplete_tags,
            get_workspace,
            set_workspace_key,
            create_note,
            create_folder,
            delete_file,
            delete_paths,
            move_paths,
            search_content,
            search_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
