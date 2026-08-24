mod app_state;
mod cache;
mod commands;
mod config;
mod watcher;
mod workspace;

pub use app_state::AppState;

use tauri::Manager;

/// Wall-clock anchor for TTI measurement (ADR-017): set before any Tauri
/// setup so `boot` can report how long after process spawn the webview's
/// first invoke arrives. Read via [`process_uptime_ms`].
pub static PROCESS_START: std::sync::OnceLock<std::time::Instant> =
    std::sync::OnceLock::new();

/// Milliseconds since the process started, or `None` if the anchor was not
/// initialized (should never happen — `run()` sets it first).
pub fn process_uptime_ms() -> Option<u64> {
    PROCESS_START.get().map(|t| t.elapsed().as_millis() as u64)
}

use commands::{
    autocomplete_links, autocomplete_tags, boot, create_folder, create_note, create_untitled_note,
    delete_file, delete_paths, get_backlinks, get_settings, get_vault_tree, get_workspace,
    move_paths, open_file, open_files, open_vault_dialog, reindex_vault, save_file, save_files,
    search_content, search_files, set_setting, set_vault, set_workspace_key, write_dev_report,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = PROCESS_START.set(std::time::Instant::now());
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(move |app| {
            // Speculative parallel boot (ADR-020 move 1): run the full boot
            // pipeline while the webview loads. The `boot` invoke serves the
            // cached result — see commands::boot::run_preboot.
            {
                let handle = app.handle().clone();
                std::thread::Builder::new()
                    .name("preboot".into())
                    .spawn(move || commands::boot::run_preboot(handle))?;
            }
            // Failsafe for the hidden-until-painted window (ADR-020 move 2):
            // if the frontend never paints (JS error, asset failure), show
            // anyway — an invisible app is worse than a blank one.
            {
                let handle = app.handle().clone();
                std::thread::Builder::new()
                    .name("show-failsafe".into())
                    .spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(10));
                        if let Some(win) = handle.get_webview_window("main") {
                            if !win.is_visible().unwrap_or(true) {
                                let _ = win.show();
                            }
                        }
                    })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            boot,
            set_vault,
            set_setting,
            get_settings,
            reindex_vault,
            get_vault_tree,
            open_vault_dialog,
            open_file,
            open_files,
            save_file,
            save_files,
            get_backlinks,
            autocomplete_links,
            autocomplete_tags,
            get_workspace,
            set_workspace_key,
            create_note,
            create_untitled_note,
            create_folder,
            delete_file,
            delete_paths,
            move_paths,
            search_content,
            search_files,
            write_dev_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
