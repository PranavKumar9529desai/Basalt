#![cfg(not(target_arch = "wasm32"))]

use std::path::Path;
use ignore::WalkBuilder;
use crate::Vault;

pub fn index_directory(path: &Path) -> Vault {
    let mut vault = Vault::new();

    let walker = WalkBuilder::new(path)
        .build();

    for result in walker {
        if let Ok(entry) = result {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                let entry_path = entry.path();
                if entry_path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    if let Ok(text) = std::fs::read_to_string(entry_path) {
                        if let Some(path_str) = entry_path.to_str() {
                            vault.add_document(path_str, &text);
                        }
                    }
                }
            }
        }
    }

    vault
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_index_directory() {
        let temp_dir = std::env::temp_dir().join("basalt_test_dummy");
        let _ = fs::remove_dir_all(&temp_dir); // clean up before
        fs::create_dir_all(&temp_dir).unwrap();
        
        fs::write(temp_dir.join("a.md"), "Link to [B](b.md)").unwrap();
        fs::write(temp_dir.join("b.md"), "Link to [A](a.md)").unwrap();
        
        let sub_dir = temp_dir.join("sub");
        fs::create_dir(&sub_dir).unwrap();
        fs::write(sub_dir.join("c.md"), "No links here").unwrap();
        
        let vault = index_directory(&temp_dir);
        
        let id_a = vault.arena.get_id(temp_dir.join("a.md").to_str().unwrap());
        let id_b = vault.arena.get_id(temp_dir.join("b.md").to_str().unwrap());
        let id_c = vault.arena.get_id(sub_dir.join("c.md").to_str().unwrap());
        
        assert!(id_a.is_some(), "a.md should be in arena");
        assert!(id_b.is_some(), "b.md should be in arena");
        assert!(id_c.is_some(), "c.md should be in arena");
        
        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
