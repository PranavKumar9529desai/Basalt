//! Block ID scanning (`^block-id`), ASCII and Unicode tiers.

use crate::utf16::SpanCursor;
use basalt_types::{FileMetadata, Span};

#[inline]
pub(crate) fn scan_block_id_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if !is_valid_start {
        return None;
    }

    let start_byte = i;
    let start = i + 1;
    let mut end = start;

    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-') {
        end += 1;
    }

    if end > start {
        let block_id = input.get(start..end).unwrap_or("");
        meta.block_ids.push((
            block_id.to_string(),
            Span {
                start: start_byte,
                end,
            },
        ));
        Some(end)
    } else {
        None
    }
}
#[inline]
pub(crate) fn scan_block_id_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_valid_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if !is_valid_start {
        return None;
    }

    let start_byte = i;
    let start = i + 1;
    let mut end = start;

    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-') {
        end += 1;
    }

    if end > start {
        let block_id = input.get(start..end).unwrap_or("");
        cursor.advance_to(start_byte, input);
        let u16_start = cursor.utf16_idx;
        let delta = end - start_byte; // block IDs are strictly ASCII
        let u16_end = u16_start + delta;
        cursor.byte_idx = end;
        cursor.utf16_idx = u16_end;

        meta.block_ids.push((
            block_id.to_string(),
            Span {
                start: u16_start,
                end: u16_end,
            },
        ));
        Some(end)
    } else {
        None
    }
}
