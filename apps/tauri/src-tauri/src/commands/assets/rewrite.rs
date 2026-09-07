//! Embed-target rewriting helpers for asset moves.

use std::path::Path;

/// Strip only the final extension segment of a path-like string, keeping any
/// directory components. `"_attachments/foo.png"` → `"_attachments/foo"`;
/// `"_attachments/foo"` (no dot) is returned unchanged.
pub(super) fn strip_last_ext(s: &str) -> &str {
    let slash = s.rfind('/').map_or(0, |v| v + 1);
    match s[slash..].rfind('.') {
        Some(dot) => &s[..slash + dot],
        None => s,
    }
}

/// Rewrite `[[old_target]]` / `![[old_target]]` wikilink targets (preserving
/// aliases, anchors, and the target's extension) to `new_target`.
///
/// Boundary-aware: a target only matches when its extension-stripped form
/// equals `old_target`, so moving `_attachments/foo.png` never corrupts
/// `![[foobar.png]]` or `![[foo/bar.png]]`. Both plain links and embeds are
/// rewritten. Matching is case-insensitive; the canonical `new_target` (with
/// the original extension) is written back.
pub(super) fn rewrite_asset_embeds(content: &str, old_target: &str, new_target: &str) -> String {
    let bytes = content.as_bytes();
    let n = bytes.len();
    let mut out = String::with_capacity(content.len() + 16);
    let mut last = 0usize;
    let mut i = 0usize;
    while i < n {
        let is_embed =
            i + 2 < n && bytes[i] == b'!' && bytes[i + 1] == b'[' && bytes[i + 2] == b'[';
        let is_link = i + 1 < n && bytes[i] == b'[' && bytes[i + 1] == b'[';
        if !(is_embed || is_link) {
            i += 1;
            continue;
        }
        let target_start = i + if is_embed { 3 } else { 2 };
        let mut j = target_start;
        while j < n && !matches!(bytes[j], b']' | b'|' | b'#') {
            j += 1;
        }
        let raw_target = &content[target_start..j];
        let trimmed = raw_target.trim();
        if strip_last_ext(trimmed).eq_ignore_ascii_case(old_target) {
            out.push_str(&content[last..i]);
            out.push_str(&content[i..target_start]); // keep `![[` / `[[`
            out.push_str(new_target);
            if let Some(ext) = Path::new(trimmed).extension().and_then(|e| e.to_str()) {
                out.push('.');
                out.push_str(ext);
            }
            let trailing = &content[target_start + trimmed.len()..j];
            out.push_str(trailing);
            last = j;
            i = j;
        } else {
            i = j; // skip past this target, keep scanning
        }
    }
    out.push_str(&content[last..]);
    out
}