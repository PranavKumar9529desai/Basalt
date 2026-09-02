pub mod assets;
pub mod boot;
pub mod common;
pub mod dev;
pub mod files;
pub mod folders;
pub mod frontmatter;
pub mod notes;
pub mod query;
pub mod search;
pub mod settings;
pub mod vault;

pub use boot::{boot, set_vault};
pub use dev::write_dev_report;
pub use query::run_query;

pub use files::{open_file, open_files, save_file, save_files};

pub use notes::{
    autocomplete_links, autocomplete_tags, create_note, create_untitled_note,
    get_backlinks, rename_note,
};

pub use folders::{
    create_folder, delete_file, delete_paths, move_paths, rename_path,
};

pub use assets::{
    cleanup_assets, get_asset_audit, get_assets, reorganize_assets,
    save_attachment,
};

pub use frontmatter::parse_frontmatter;
pub use settings::{get_settings, get_workspace, set_setting, set_workspace_key};
pub use search::{search_content, search_files};
pub use vault::{get_graph, get_vault_tree, open_vault_dialog, reindex_vault};
