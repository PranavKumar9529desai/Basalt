//! HTTP/1.1 request parsing and response planning for the loopback media
//! server (ADR-034 part A). Pure protocol logic — no sockets or Tauri state.

use std::path::Path;

use http_range::HttpRange;

#[derive(Default, Debug, PartialEq)]
pub(crate) struct ParsedRequest {
    /// Decoded `path` query parameter (absolute file path on disk).
    pub(crate) path: Option<String>,
    /// Raw `Range` header value, if present.
    pub(crate) range: Option<String>,
}

/// Parse the first line + headers of an HTTP/1.1 request. Returns `None` for
/// anything malformed or non-GET.
pub(crate) fn parse_request(raw: &str) -> Option<ParsedRequest> {
    let mut lines = raw.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" {
        return None;
    }

    // `target` is `/media?path=<url-encoded-abs-path>`.
    let (path_and_query, _frag) = target.split_once('#').unwrap_or((target, ""));
    let query = path_and_query.rsplit_once('?').map(|(_, q)| q)?;
    let mut parsed = ParsedRequest::default();
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == "path" {
            parsed.path = Some(percent_decode(value));
        }
    }

    for line in lines {
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("range") {
            parsed.range = Some(value.trim().to_string());
        }
    }

    Some(parsed)
}

/// Minimal URL percent-decoding (`%XX` → byte). Invalid escapes pass through.
pub(crate) fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub(crate) fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// MIME table mirroring the editor's `classifyMediaExtension` (ADR-034). Only
/// known media is served — anything else resolves to octet-stream and is
/// refused, so the server can never be used to read arbitrary vault files.
pub(crate) fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" => "audio/ogg",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "opus" => "audio/opus",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// Planned response for a parsed request — status line, headers, and the byte
/// range to stream. Range requests get 206 + `Content-Range` (WebKitGTK seeks
/// by issuing Range requests); plain GETs get 200 with the full file.
pub(crate) struct ResponsePlan {
    pub(crate) status: u16,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) range: Option<(u64, u64)>,
}

pub(crate) fn plan_response(parsed: &ParsedRequest, file_size: u64, mime: &str) -> ResponsePlan {
    let mut headers = vec![
        ("Content-Type".to_string(), mime.to_string()),
        ("Accept-Ranges".to_string(), "bytes".to_string()),
        ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
    ];

    match parsed.range.as_deref() {
        Some(range_header) => {
            let ranges = HttpRange::parse(range_header, file_size);
            match ranges.ok().and_then(|v| v.into_iter().next()) {
                Some(r) if r.start < file_size => {
                    let start = r.start;
                    let len = r.length.min(file_size - start);
                    let end = start + len - 1;
                    headers.push((
                        "Content-Range".to_string(),
                        format!("bytes {start}-{end}/{file_size}"),
                    ));
                    headers.push(("Content-Length".to_string(), len.to_string()));
                    ResponsePlan {
                        status: 206,
                        headers,
                        range: Some((start, len)),
                    }
                }
                _ => {
                    // Unsatifiable range.
                    headers.push(("Content-Range".to_string(), format!("bytes */{file_size}")));
                    ResponsePlan {
                        status: 416,
                        headers,
                        range: None,
                    }
                }
            }
        }
        None => {
            headers.push(("Content-Length".to_string(), file_size.to_string()));
            ResponsePlan {
                status: 200,
                headers,
                range: Some((0, file_size)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn request(s: &str) -> ParsedRequest {
        parse_request(s).expect("valid request")
    }

    #[test]
    fn parses_get_with_query_and_range() {
        let parsed =
            request("GET /media?path=%2Fvault%2Fclip.mp4 HTTP/1.1\r\nRange: bytes=0-99\r\n\r\n");
        assert_eq!(parsed.path.as_deref(), Some("/vault/clip.mp4"));
        assert_eq!(parsed.range.as_deref(), Some("bytes=0-99"));
    }

    #[test]
    fn decodes_utf8_percent_encoding() {
        assert_eq!(percent_decode("clip%20final.mp4"), "clip final.mp4");
        assert_eq!(percent_decode("r%C3%A9sum%C3%A9.pdf"), "résumé.pdf");
    }

    #[test]
    fn rejects_non_get_and_missing_path() {
        assert!(parse_request("POST /media HTTP/1.1\r\n\r\n").is_none());
        assert!(parse_request("GET /media HTTP/1.1\r\n\r\n").is_none());
        assert_eq!(request("GET /media?nopath=1 HTTP/1.1\r\n\r\n").path, None);
    }

    #[test]
    fn mime_table_covers_media_fixtures() {
        let p = |ext: &str| PathBuf::from(format!("x.{ext}"));
        assert_eq!(mime_for(&p("png")), "image/png");
        assert_eq!(mime_for(&p("svg")), "image/svg+xml");
        assert_eq!(mime_for(&p("mp4")), "video/mp4");
        assert_eq!(mime_for(&p("webm")), "video/webm");
        assert_eq!(mime_for(&p("mp3")), "audio/mpeg");
        assert_eq!(mime_for(&p("flac")), "audio/flac");
        assert_eq!(mime_for(&p("opus")), "audio/opus");
        assert_eq!(mime_for(&p("pdf")), "application/pdf");
        assert_eq!(mime_for(&p("txt")), "application/octet-stream");
    }

    #[test]
    fn full_get_returns_200_with_whole_file() {
        let plan = plan_response(
            &request("GET /media?path=x HTTP/1.1\r\n\r\n"),
            1000,
            "video/mp4",
        );
        assert_eq!(plan.status, 200);
        assert_eq!(plan.range, Some((0, 1000)));
        assert!(plan
            .headers
            .iter()
            .any(|(k, v)| k == "Content-Length" && v == "1000"));
    }

    #[test]
    fn range_request_returns_206_with_content_range() {
        let parsed = request("GET /media?path=x HTTP/1.1\r\nRange: bytes=200-499\r\n\r\n");
        let plan = plan_response(&parsed, 1000, "video/mp4");
        assert_eq!(plan.status, 206);
        assert_eq!(plan.range, Some((200, 300)));
        assert!(plan
            .headers
            .iter()
            .any(|(k, v)| k == "Content-Range" && v == "bytes 200-499/1000"));
    }

    #[test]
    fn open_ended_range_clamps_to_file_size() {
        let parsed = request("GET /media?path=x HTTP/1.1\r\nRange: bytes=800-\r\n\r\n");
        let plan = plan_response(&parsed, 1000, "video/mp4");
        assert_eq!(plan.status, 206);
        assert_eq!(plan.range, Some((800, 200)));
    }

    #[test]
    fn unsatisfiable_range_returns_416() {
        let parsed = request("GET /media?path=x HTTP/1.1\r\nRange: bytes=5000-6000\r\n\r\n");
        let plan = plan_response(&parsed, 1000, "video/mp4");
        assert_eq!(plan.status, 416);
        assert_eq!(plan.range, None);
    }
}
