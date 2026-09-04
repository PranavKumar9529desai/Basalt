use serde::{Deserialize, Serialize};
use std::path::Path;

/// Classification of non-markdown file types by extension.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    Image,
    Video,
    Audio,
    Document,
    Other,
}

impl FileType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Document => "document",
            Self::Other => "other",
        }
    }
}

/// Infer file type from a filename's extension.
pub fn infer_file_type(filename: &str) -> FileType {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "tif"
        | "heic" | "heif" => FileType::Image,
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" => FileType::Video,
        "mp3" | "wav" | "aac" | "ogg" | "flac" | "wma" | "m4a" | "opus" => FileType::Audio,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "csv" | "rtf"
        | "odt" => FileType::Document,
        _ => FileType::Other,
    }
}

/// Infer MIME type from a filename's extension. Returns a static string so the
/// hot path performs no allocation (ADR-030 §2.5).
pub fn infer_mime_type(filename: &str) -> &'static str {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "opus" => "audio/opus",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}
