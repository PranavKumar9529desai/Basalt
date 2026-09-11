//! Zero-AST metadata scanner: frontmatter, links, tags, headings, and block IDs.
//!
//! Two tiers share identical token logic but differ in span representation:
//! - ASCII fast path: byte offsets = UTF-16 code units, zero overhead.
//! - Unicode path: streaming `SpanCursor` tracks the UTF-8 → UTF-16 mapping.
//!
//! The per-token scanners live in sibling modules ([`links`], [`block_ids`],
//! [`headings_tags`]) as ASCII/Unicode pairs. The duplication is deliberate —
//! the ASCII fast path must stay a zero-allocation, SIMD-driven hot loop
//! (ADR-041); collapsing the tiers would push cursor bookkeeping into every
//! token on the hot path.

use crate::frontmatter::{collect_frontmatter_refs, fm_bounds, frontmatter_body_offset};
use crate::task_scan::{is_task_checkbox, scan_task_line, scan_task_line_unicode};
use crate::utf16::SpanCursor;
use basalt_types::FileMetadata;

mod block_ids;
mod headings_tags;
mod links;
#[cfg(test)]
mod tests;

use block_ids::{scan_block_id_ascii, scan_block_id_unicode};
use headings_tags::{scan_heading_or_tag_ascii, scan_heading_or_tag_unicode};
use links::{scan_wikilink_or_embed_ascii, scan_wikilink_or_embed_unicode};

/// Consume YAML frontmatter between `---` fences, extracting its properties
/// as first-class graph/backlink edges. Returns the body byte offset (past
/// the closing fence) or 0 when no frontmatter is present.
fn consume_frontmatter(input: &str, meta: &mut FileMetadata) -> usize {
    let (open_end, close_start) = match fm_bounds(input) {
        Some(bounds) => bounds,
        None => return 0,
    };
    let frontmatter_str = &input[open_end..close_start];

    let yaml = match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(frontmatter_str) {
        Ok(v) => v,
        Err(_) => return 0,
    };
    meta.frontmatter = Some(yaml);

    // Make frontmatter properties first-class: extract wikilinks,
    // tags, and aliases so they reach graph, backlinks and search.
    if let Some(fm) = &meta.frontmatter {
        let mut fm_links: Vec<String> = Vec::new();
        let mut fm_tags: Vec<String> = Vec::new();
        let mut fm_aliases: Vec<String> = Vec::new();
        collect_frontmatter_refs(fm, &mut fm_links, &mut fm_tags, &mut fm_aliases);

        meta.links.extend(fm_links);
        meta.tags.extend(fm_tags);
        meta.aliases.extend(fm_aliases);
    }

    frontmatter_body_offset(input)
}

/// ASCII-tier dispatch: scan the body for every token kind, writing byte
/// spans directly (byte offset = UTF-16 code unit on pure-ASCII input).
///
/// Also threads a monotonic 1-based `line_no` counter (ADR-041 hot loop):
/// every `\n` that `i` advances past is counted exactly once, so task span
/// line numbers cost O(1) amortized instead of the previous per-task prefix
/// rescan (O(T × L) per file for T task lines).
fn scan_body_tokens_ascii(input: &str, start: usize, meta: &mut FileMetadata) {
    let bytes = input.as_bytes();
    let mut i = start;
    // 1-based line of the current byte; seeded from any frontmatter lines
    // before the body start. Invariant: equals the number of `\n` before
    // `i` plus one, maintained by counting in every range `i` advances
    // through (memchr3 skip regions + token-consumed ranges).
    let mut line_no: u32 = memchr::memchr_iter(b'\n', &bytes[..start]).count() as u32 + 1;

    while i < bytes.len() {
        let rel = match memchr::memchr3(b'[', b'^', b'#', &bytes[i..]) {
            Some(r) => r,
            None => break,
        };
        line_no += memchr::memchr_iter(b'\n', &bytes[i..i + rel]).count() as u32;
        i += rel;

        match bytes[i] {
            b'[' => {
                // Checkbox list item (`- [ ]`, `* [ ]`, `1. [ ]`; indented or
                // behind `>` prefixes). Checked before wikilinks so a task
                // line is consumed whole: the checkbox bracket is not a link,
                // and inner [[wikilinks]] stay part of the task description.
                if is_task_checkbox(bytes, i) {
                    if let Some(next_i) = scan_task_line(input, bytes, i, line_no, meta) {
                        line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                        i = next_i;
                        continue;
                    }
                }
                if let Some(next_i) = scan_wikilink_or_embed_ascii(input, bytes, i, meta) {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            b'^' => {
                if let Some(next_i) = scan_block_id_ascii(input, bytes, i, meta) {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            b'#' => {
                if let Some(next_i) = scan_heading_or_tag_ascii(input, bytes, i, meta) {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            _ => unreachable!(),
        }
        i += 1;
    }
}

/// Unicode-tier dispatch: same scan as [`scan_body_tokens_ascii`], but spans
/// are translated to UTF-16 code units via a streaming `SpanCursor`. Same
/// monotonic `line_no` counter contract as the ASCII tier.
fn scan_body_tokens_unicode(input: &str, start: usize, meta: &mut FileMetadata) {
    let bytes = input.as_bytes();
    let mut i = start;
    let mut line_no: u32 = memchr::memchr_iter(b'\n', &bytes[..start]).count() as u32 + 1;
    let mut cursor = SpanCursor::new();

    while i < bytes.len() {
        let rel = match memchr::memchr3(b'[', b'^', b'#', &bytes[i..]) {
            Some(r) => r,
            None => break,
        };
        line_no += memchr::memchr_iter(b'\n', &bytes[i..i + rel]).count() as u32;
        i += rel;

        match bytes[i] {
            b'[' => {
                // Checkbox list item; see scan_body_tokens_ascii.
                if is_task_checkbox(bytes, i) {
                    if let Some(next_i) =
                        scan_task_line_unicode(input, bytes, i, line_no, &mut cursor, meta)
                    {
                        line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                        i = next_i;
                        continue;
                    }
                }
                if let Some(next_i) =
                    scan_wikilink_or_embed_unicode(input, bytes, i, &mut cursor, meta)
                {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            b'^' => {
                if let Some(next_i) = scan_block_id_unicode(input, bytes, i, &mut cursor, meta) {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            b'#' => {
                if let Some(next_i) =
                    scan_heading_or_tag_unicode(input, bytes, i, &mut cursor, meta)
                {
                    line_no += memchr::memchr_iter(b'\n', &bytes[i..next_i]).count() as u32;
                    i = next_i;
                    continue;
                }
            }
            _ => unreachable!(),
        }
        i += 1;
    }
}

/// Scan the markdown body for links, embeds, tags, headings, and block IDs,
/// populating `meta` in place.
fn scan_body_tokens(input: &str, start: usize, meta: &mut FileMetadata) {
    if input.is_ascii() {
        scan_body_tokens_ascii(input, start, meta);
    } else {
        scan_body_tokens_unicode(input, start, meta);
    }
}

/// Zero-AST metadata extractor: frontmatter, tags, links, embeds, headings,
/// block IDs, and tasks. Used by `basalt-vault` to index thousands of files
/// without building a full AST.
pub fn extract_metadata(input: &str) -> FileMetadata {
    let mut meta = FileMetadata::new();
    let body_start = consume_frontmatter(input, &mut meta);
    scan_body_tokens(input, body_start, &mut meta);
    meta.links.sort_unstable();
    meta.links.dedup();
    meta.tags.sort_unstable();
    meta.tags.dedup();
    meta
}
