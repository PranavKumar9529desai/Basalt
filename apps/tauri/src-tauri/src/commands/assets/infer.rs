//! Asset-type / content inference helpers — detect a file's extension from
//! its name or magic bytes (consumed by `save::save_attachment`).

use std::path::Path;

/// Infer extension from the last `.` segment of a name, if it looks like a
/// real extension (1–8 lowercase alphanum chars).
pub(super) fn infer_ext_from_name(name: &str) -> Option<&'static str> {
    let ext = Path::new(name).extension()?.to_str()?;
    // Match known extensions and return a static string literal (not a
    // borrow of `name`).
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpg" | "jpeg" => Some("jpg"),
        "gif" => Some("gif"),
        "webp" => Some("webp"),
        "svg" => Some("svg"),
        "bmp" => Some("bmp"),
        "pdf" => Some("pdf"),
        "mp3" => Some("mp3"),
        "wav" => Some("wav"),
        "mp4" => Some("mp4"),
        "mov" => Some("mov"),
        "webm" => Some("webm"),
        "ico" => Some("ico"),
        _ => None,
    }
}

/// Try to guess extension from file magic bytes.
pub(super) fn infer_ext_from_data(data: &[u8]) -> Option<&'static str> {
    if data.len() < 8 {
        return None;
    }
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if data.starts_with(b"\xff\xd8\xff") {
        return Some("jpg");
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if data.starts_with(b"RIFF") && data.len() > 12 && &data[8..12] == b"WEBP" {
        return Some("webp");
    }
    if data.starts_with(b"%PDF") {
        return Some("pdf");
    }
    if data.starts_with(b"\x00\x00\x00") && data.len() > 12 && &data[4..8] == b"ftyp" {
        // MP4 / MOV / HEIC etc — default to mp4
        return Some("mp4");
    }
    None
}

/// Strip the file extension from a name, if present and known.
pub(super) fn strip_ext_from_name(name: &str) -> &str {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    if stem.len() == name.len() {
        name
    } else {
        stem
    }
}
