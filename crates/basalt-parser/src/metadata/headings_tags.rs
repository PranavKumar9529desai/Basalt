//! Heading and tag scanning (`# H1`, `#tag`), ASCII and Unicode tiers.

use crate::utf16::SpanCursor;
use basalt_types::{FileMetadata, Span};

#[inline]
pub(crate) fn scan_heading_or_tag_ascii(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_line_start = i == 0 || bytes[i - 1] == b'\n' || bytes[i - 1] == b'\r';
    if is_line_start {
        let mut level = 1;
        let mut temp_i = i + 1;
        while temp_i < bytes.len() && bytes[temp_i] == b'#' {
            level += 1;
            temp_i += 1;
        }
        if temp_i < bytes.len() && bytes[temp_i] == b' ' {
            let start_byte = i;
            temp_i += 1;
            let text_start = temp_i;
            let end_heading = match memchr::memchr(b'\n', &bytes[temp_i..]) {
                Some(rel) => temp_i + rel,
                None => bytes.len(),
            };
            let text_content = input
                .get(text_start..end_heading)
                .unwrap_or("")
                .trim()
                .to_string();

            meta.headings.push((
                level as u8,
                text_content,
                Span {
                    start: start_byte,
                    end: end_heading,
                },
            ));
            return Some(end_heading);
        }
    }

    let valid_tag_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if valid_tag_start {
        let start_byte = i;
        let start = i + 1;
        let mut end = start;

        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_' || bytes[end] == b'-')
        {
            end += 1;
        }

        if end > start {
            let tag = input.get(start..end).unwrap_or("");
            let is_all_numbers = tag.bytes().all(|b| b.is_ascii_digit());
            let is_hex_color =
                (tag.len() == 3 || tag.len() == 4 || tag.len() == 6 || tag.len() == 8)
                    && tag.bytes().all(|b| b.is_ascii_hexdigit());

            if !tag.is_empty() && !is_all_numbers && !is_hex_color {
                meta.tags.push(tag.to_string());
                meta.tag_locations.push((
                    tag.to_string(),
                    Span {
                        start: start_byte,
                        end,
                    },
                ));
            }
            return Some(end);
        }
    }

    None
}
#[inline]
pub(crate) fn scan_heading_or_tag_unicode(
    input: &str,
    bytes: &[u8],
    i: usize,
    cursor: &mut SpanCursor,
    meta: &mut FileMetadata,
) -> Option<usize> {
    let is_line_start = i == 0 || bytes[i - 1] == b'\n' || bytes[i - 1] == b'\r';
    if is_line_start {
        let mut level = 1;
        let mut temp_i = i + 1;
        while temp_i < bytes.len() && bytes[temp_i] == b'#' {
            level += 1;
            temp_i += 1;
        }
        if temp_i < bytes.len() && bytes[temp_i] == b' ' {
            let start_byte = i;
            temp_i += 1;
            let text_start = temp_i;
            let end_heading = match memchr::memchr(b'\n', &bytes[temp_i..]) {
                Some(rel) => temp_i + rel,
                None => bytes.len(),
            };
            let text_content = input
                .get(text_start..end_heading)
                .unwrap_or("")
                .trim()
                .to_string();

            cursor.advance_to(start_byte, input);
            let u16_start = cursor.utf16_idx;
            cursor.advance_to(end_heading, input);
            let u16_end = cursor.utf16_idx;

            meta.headings.push((
                level as u8,
                text_content,
                Span {
                    start: u16_start,
                    end: u16_end,
                },
            ));
            return Some(end_heading);
        }
    }

    let valid_tag_start = i == 0 || bytes[i - 1].is_ascii_whitespace();
    if valid_tag_start {
        let start_byte = i;
        let start = i + 1;
        let mut end = start;

        while end < bytes.len()
            && (bytes[end].is_ascii_alphanumeric()
                || bytes[end] == b'_'
                || bytes[end] == b'-'
                || bytes[end] > 127)
        {
            end += 1;
        }

        if end > start {
            let tag = input.get(start..end).unwrap_or("");
            let is_all_numbers = tag.chars().all(|c| c.is_ascii_digit());
            let is_hex_color =
                (tag.len() == 3 || tag.len() == 4 || tag.len() == 6 || tag.len() == 8)
                    && tag.chars().all(|c| c.is_ascii_hexdigit());

            if !tag.is_empty() && !is_all_numbers && !is_hex_color {
                meta.tags.push(tag.to_string());
                cursor.advance_to(start_byte, input);
                let u16_start = cursor.utf16_idx;
                cursor.advance_to(end, input);
                let u16_end = cursor.utf16_idx;

                meta.tag_locations.push((
                    tag.to_string(),
                    Span {
                        start: u16_start,
                        end: u16_end,
                    },
                ));
            } else {
                cursor.advance_to(end, input);
            }
            return Some(end);
        }
    }

    None
}
