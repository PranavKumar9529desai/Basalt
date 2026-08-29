pub mod boot;
pub mod dev;
pub mod files;
pub mod search;
pub mod settings;
pub mod vault;

pub mod frontmatter;

pub use boot::{boot, set_vault};
pub use dev::write_dev_report;
pub use files::{
    autocomplete_links, autocomplete_tags, create_folder, create_note, create_untitled_note,
    delete_file, delete_paths, get_backlinks, move_paths, open_file, open_files, save_file,
    save_files,
};

pub use frontmatter::parse_frontmatter;
pub use settings::{get_settings, get_workspace, set_setting, set_workspace_key};
pub use search::{search_content, search_files};
pub use vault::{get_graph, get_vault_tree, open_vault_dialog, reindex_vault};
