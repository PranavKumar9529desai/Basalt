pub mod assets;
pub mod boot;
pub mod calendar;
pub mod canvas;
pub mod common;
pub mod dailies;
pub mod dev;
pub mod drawing;
pub mod files;
pub mod folders;
pub mod frontmatter;
pub mod media;
pub mod notes;
pub mod query;
pub mod search;
pub mod settings;
pub mod tasks;
pub mod templates;
pub mod vault;

pub use boot::{boot, set_vault};
pub use dev::write_dev_report;
pub use query::run_query;

pub use files::{open_file, open_files, save_file, save_files};

pub use notes::{
    autocomplete_links, autocomplete_tags, create_note, create_untitled_note, get_backlinks,
    get_tag_counts, rename_note,
};

pub use folders::{create_folder, delete_file, delete_paths, move_paths, rename_path};

pub use assets::{cleanup_assets, get_asset_audit, get_assets, reorganize_assets, save_attachment};
pub use media::media_server_url;

pub use canvas::{create_untitled_canvas, open_canvas, parse_canvas, save_canvas};
pub use dailies::open_daily_note;
pub use calendar::calendar_activity;
pub use drawing::{
    create_untitled_drawing, is_drawing_file, parse_drawing, read_drawing, save_drawing,
    serialize_drawing,
};
pub use frontmatter::parse_frontmatter;
pub use search::{search_content, search_files};
pub use settings::{get_settings, get_workspace, set_setting, set_workspace_key};
pub use tasks::{create_task, get_task_line, get_tasks, toggle_task, update_task};
pub use templates::{list_templates, read_template};
pub use vault::{get_graph, get_vault_tree, open_vault_dialog, reindex_vault};
