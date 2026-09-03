use std::path::{Path, PathBuf};

/// Errors produced while resolving a file/folder creation path.
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum PathError {
    /// The submitted name was empty or whitespace-only.
    #[error("name cannot be empty")]
    EmptyName,
    /// The submitted name consisted only of path separators.
    #[error("name cannot be just slashes")]
    SlashesOnly,
    /// The nested path exceeded the maximum safe depth of 10.
    #[error("path exceeds maximum nested depth of 10 levels")]
    TooDeep,
    /// A component contained an invalid filesystem character.
    #[error("path contains invalid characters")]
    InvalidChars,
    /// A folder or file name exceeded the 255-byte maximum.
    #[error("a folder or file name exceeds the 255 byte maximum limit")]
    NameTooLong,
    /// The resulting path exceeded the safe total length cap.
    #[error("resulting path exceeds safe total length limits")]
    PathTooLong,
}

/// Resolves a file or folder creation path based on the user's input.
///
/// Handles VS Code style slash syntax (`folder/subfolder/file.md`), ensuring that:
/// - Nested paths are limited to a safe depth of 10.
/// - Folder/File names are under the standard 255-byte limit.
/// - Invalid OS path characters are rejected.
/// - Overall cross-platform safe lengths are respected.
pub fn resolve_creation_path(
    vault_path: &Path,
    parent: Option<&str>,
    name: &str,
    is_folder: bool,
) -> Result<(PathBuf, PathBuf, String), PathError> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err(PathError::EmptyName);
    }

    // Limit overall split depth to prevent malicious nesting streams
    // Split by either / or \ to handle cross-platform inputs
    let components: Vec<&str> = clean_name
        .split(['/', '\\'])
        .filter(|s| !s.is_empty())
        .collect();

    if components.is_empty() {
        return Err(PathError::SlashesOnly);
    }

    if components.len() > 10 {
        return Err(PathError::TooDeep);
    }

    // Reject invalid filesystem characters across all components
    for comp in &components {
        if comp
            .chars()
            .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        {
            return Err(PathError::InvalidChars);
        }
        if comp.len() > 255 {
            return Err(PathError::NameTooLong);
        }
    }

    let target_dir = match &parent {
        Some(rel) if !rel.is_empty() => vault_path.join(rel),
        _ => vault_path.to_path_buf(),
    };

    let mut final_dir = target_dir.clone();

    // Add all intermediate folders
    for component in components.iter().take(components.len() - 1) {
        final_dir.push(component);
    }

    let mut final_name = components.last().unwrap().to_string();
    if !is_folder {
        final_name = final_name.trim_end_matches(".md").to_string();
        final_name.push_str(".md");
    }

    let final_path = final_dir.join(&final_name);

    // Sanity check total resulting path length (using ~1000 char safe cap)
    if final_path.to_string_lossy().len() > 1000 {
        return Err(PathError::PathTooLong);
    }

    Ok((final_dir, final_path, final_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_note_creation() {
        let vault = PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "test", false).unwrap();
        assert_eq!(dir, PathBuf::from("/vault"));
        assert_eq!(file, PathBuf::from("/vault/test.md"));
        assert_eq!(name, "test.md");
    }

    #[test]
    fn test_valid_nested_note() {
        let vault = PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "a/b/c", false).unwrap();
        assert_eq!(dir, PathBuf::from("/vault/a/b"));
        assert_eq!(file, PathBuf::from("/vault/a/b/c.md"));
        assert_eq!(name, "c.md");
    }

    #[test]
    fn test_valid_folder_creation() {
        let vault = PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "my_folder", true).unwrap();
        assert_eq!(dir, PathBuf::from("/vault"));
        assert_eq!(file, PathBuf::from("/vault/my_folder"));
        assert_eq!(name, "my_folder");
    }

    #[test]
    fn test_valid_nested_folder() {
        let vault = PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "a/b/c", true).unwrap();
        assert_eq!(dir, PathBuf::from("/vault/a/b"));
        assert_eq!(file, PathBuf::from("/vault/a/b/c"));
        assert_eq!(name, "c");
    }

    #[test]
    fn test_respects_parent_dir() {
        let vault = PathBuf::from("/vault");
        let (dir, file, name) =
            resolve_creation_path(&vault, Some("parent"), "child", false).unwrap();
        assert_eq!(dir, PathBuf::from("/vault/parent"));
        assert_eq!(file, PathBuf::from("/vault/parent/child.md"));
        assert_eq!(name, "child.md");
    }

    #[test]
    fn test_rejects_empty_name() {
        let vault = PathBuf::from("/vault");
        assert!(resolve_creation_path(&vault, None, "   ", false).is_err());
        assert!(resolve_creation_path(&vault, None, "///", false).is_err());
    }

    #[test]
    fn test_rejects_invalid_chars() {
        let vault = PathBuf::from("/vault");
        assert!(resolve_creation_path(&vault, None, "foo*bar", false).is_err());
        assert!(resolve_creation_path(&vault, None, "foo/bar?baz", false).is_err());
    }

    #[test]
    fn test_rejects_too_deep() {
        let vault = PathBuf::from("/vault");
        // 11 levels deep
        assert!(resolve_creation_path(&vault, None, "1/2/3/4/5/6/7/8/9/10/11", false).is_err());
        // 10 levels deep (allowed)
        assert!(resolve_creation_path(&vault, None, "1/2/3/4/5/6/7/8/9/10", false).is_ok());
    }

    #[test]
    fn test_rejects_long_components() {
        let vault = PathBuf::from("/vault");
        let long_name = "a".repeat(256);
        assert!(resolve_creation_path(&vault, None, &long_name, false).is_err());

        let valid_deep = "a".repeat(255);
        assert!(resolve_creation_path(&vault, None, &valid_deep, false).is_ok());
    }
}
