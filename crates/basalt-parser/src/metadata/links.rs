//! Wikilink and embed scanning (`[[Note]]`, `![[image.png]]`), ASCII and
//! Unicode tiers. Sibling `block_ids.rs` and `headings_tags.rs` hold the
//! other token kinds; the parent module runs the dispatch loop.

use crate::utf16::SpanCursor;
use crate::wikilink::wikilink_target;
use basalt_types::{FileMetadata, Span};

#[inline]
pub(crate) fn find_closing_brackets(bytes: &[u8], from: usize) -> Option<usize> {
    let mut search_from = from;
    while search_from < bytes.len() {
        let rel = memchr::memchr(b']', &bytes[search_from..])?;
        let found = search_from + rel;
        if found + 1 < bytes.len() && bytes[found + 1] == b']' {
            return Some(found);
        }
        search_from = found + 1;
    }
    None
}
#[inline]
pub(crate) fn scan_wikilink_or_embed_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    if i + 1 >= bytes.len() || bytes[i + 1] != b'[' {
        return None;
    }

    let is_embed = i > 0 && bytes[i - 1] == b'!';
    let start_byte = if is_embed { i - 1 } else { i };
    let content_start = i + 2;

    let close_i = find_closing_brackets(bytes, content_start)?;
    let end_byte = close_i + 2;

    let link_content = input.get(content_start..close_i).unwrap_or("");
    let target = wikilink_target(link_content);

    if !target.is_empty() {
        let span = Span {
            start: start_byte,
            end: end_byte,
        };
        if is_embed {
            meta.embeds.push(target.to_string());
            meta.embed_locations.push((target.to_string(), span));
        } else {
            meta.links.push(target.to_string());
            meta.link_locations.push((target.to_string(), span));
        }
    }

    Some(end_byte)
}
#[inline]
pub(crate) fn scan_wikilink_or_embed_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    if i + 1 >= bytes.len() || bytes[i + 1] != b'[' {
        return None;
    }

    let is_embed = i > 0 && bytes[i - 1] == b'!';
    let content_start = i + 2;

    let close_i = find_closing_brackets(bytes, content_start)?;
    let end_byte = close_i + 2;

    let link_content = input.get(content_start..close_i).unwrap_or("");
    let target = wikilink_target(link_content);

    if !target.is_empty() {
        cursor.advance_to(i, input);
        let u16_start = if is_embed {
            cursor.utf16_idx - 1
        } else {
            cursor.utf16_idx
        };
        cursor.advance_to(end_byte, input);
        let u16_end = cursor.utf16_idx;

        let span = Span {
            start: u16_start,
            end: u16_end,
        };
        if is_embed {
            meta.embeds.push(target.to_string());
            meta.embed_locations.push((target.to_string(), span));
        } else {
            meta.links.push(target.to_string());
            meta.link_locations.push((target.to_string(), span));
        }
    } else {
        cursor.advance_to(end_byte, input);
    }

    Some(end_byte)
}
