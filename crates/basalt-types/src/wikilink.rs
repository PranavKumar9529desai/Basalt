//! Canonical wikilink target extraction — the single implementation for the
//! whole workspace. Lives in `basalt-types` (the leaf crate) because both
//! `basalt-parser` (metadata scanner, frontmatter walker) and this crate's
//! YAML→TypedValue converter need it.

/// Extract the target from the content inside `[[...]]`.
///
/// Splits at the first `|` (alias) or `#` (anchor) and trims whitespace.
/// For `[[Note|Alias]]` returns `"Note"`. For `[[folder/Note#Section|Alias]]`
/// returns `"folder/Note"`.
#[inline]
pub fn wikilink_target(content: &str) -> &str {
    content.split(['|', '#']).next().unwrap_or("").trim()
}

/// Extract the first `[[Target]]` target as an owned string, or `None` when
/// the string has no wikilink or its target is empty. Position-finding only —
/// target splitting is delegated to [`wikilink_target`].
#[inline]
pub fn wikilink_target_owned(content: &str) -> Option<String> {
    let open = content.find("[[")?;
    let rest = &content[open + 2..];
    let close = rest.find("]]")?;
    let target = wikilink_target(&rest[..close]);
    if target.is_empty() {
        None
    } else {
        Some(target.to_string())
    }
}
