// Tauri's `#[tauri::command]` macro expansion hits `dependency_on_unit_never_type_fallback`
// (a rust_2024_compatibility lint, deny-by-default on current rustc) for commands that
// return a locally-defined struct. The generated wrapper is correct under the current
// edition; this only silences the future-compat lint. Revisit when migrating to edition 2024.
#![allow(dependency_on_unit_never_type_fallback)]
mod commands;
mod core;
mod error;

// Re-export the backend modules at the crate root so the long-established
// `crate::cache` / `crate::config` / `crate::watcher` / `crate::workspace` /
// `crate::app_state` paths keep working unchanged.
pub use core::app_state;
pub use core::cache;
pub use core::config;
pub use core::watcher;
pub use core::workspace;

pub use app_state::AppState;

use tauri::Manager;

/// Wall-clock anchor for TTI measurement (ADR-017): set before any Tauri
/// setup so `boot` can report how long after process spawn the webview's
/// first invoke arrives. Read via [`process_uptime_ms`].
pub static PROCESS_START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

/// Milliseconds since the process started, or `None` if the anchor was not
/// initialized (should never happen — `run()` sets it first).
pub fn process_uptime_ms() -> Option<u64> {
    PROCESS_START.get().map(|t| t.elapsed().as_millis() as u64)
}

use commands::{
    autocomplete_links, autocomplete_tags, boot, cleanup_assets, create_folder, create_note,
    create_task, create_untitled_canvas, create_untitled_drawing, create_untitled_note, delete_file, delete_paths,
    get_asset_audit, get_assets, get_backlinks, get_graph, get_settings, get_tag_counts, get_task_line,
    get_tasks, get_vault_tree, get_workspace,
    list_templates, media_server_url, move_paths, open_canvas, open_daily_note, open_file,
    open_files, open_vault_dialog, parse_canvas, parse_frontmatter, read_drawing, read_template, reindex_vault,
    rename_note, rename_path, reorganize_assets,
    run_query, save_attachment, save_canvas, save_drawing, save_file, save_files, search_content, search_files,
    set_setting, set_vault, set_workspace_key, toggle_task, update_task, write_dev_report,
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
            save_attachment,
            save_file,
            save_files,
            get_backlinks,
            get_assets,
            get_asset_audit,
            cleanup_assets,
            reorganize_assets,
            get_graph,
            autocomplete_links,
            autocomplete_tags,
            get_tag_counts,
            get_workspace,
            set_workspace_key,
            create_note,
            create_untitled_note,
            open_daily_note,
            list_templates,
            read_template,
            create_folder,
            delete_file,
            delete_paths,
            move_paths,
            rename_note,
            rename_path,
            search_content,
            search_files,
            write_dev_report,
            parse_frontmatter,
            run_query,
            open_canvas,
            save_canvas,
            create_untitled_canvas,
            parse_canvas,
            read_drawing,
            save_drawing,
            create_untitled_drawing,
            get_tasks,
            toggle_task,
            create_task,
            update_task,
            get_task_line,
            media_server_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
