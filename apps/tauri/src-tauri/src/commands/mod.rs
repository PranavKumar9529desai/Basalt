pub mod boot;
pub mod dev;
pub mod files;
pub mod search;
pub mod settings;
pub mod vault;

pub mod frontmatter;
pub mod query;

pub use boot::{boot, set_vault};
pub use dev::write_dev_report;
pub use query::run_query;

pub use files::{
    autocomplete_links, autocomplete_tags, create_folder, create_note, create_untitled_note,
    delete_file, delete_paths, get_asset_audit, get_assets, get_backlinks, move_paths, open_file,
    open_files, rename_note, rename_path, save_attachment, save_file, save_files,
};

pub use frontmatter::parse_frontmatter;
pub use settings::{get_settings, get_workspace, set_setting, set_workspace_key};
pub use search::{search_content, search_files};
pub use vault::{get_graph, get_vault_tree, open_vault_dialog, reindex_vault};
