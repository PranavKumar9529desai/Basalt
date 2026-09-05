//! Loopback media server — serves vault files over `http://127.0.0.1:<port>`.
//!
//! ADR-034 part A: WebKitGTK's media pipeline (GStreamer) has no handler for
//! Tauri's `asset://` scheme, so `<video>`/`<audio>` never load on Linux even
//! when every system codec is installed (WebKit bug 146351, tauri#3725). The
//! durable workaround is a tiny loopback HTTP listener with Range/206 support,
//! which GStreamer plays reliably. macOS/Windows keep `asset://` and never
//! call this server.

use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{Manager, State};

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

/// Lazily-started server base URL (same `OnceLock<Mutex<Option<…>>>` pattern
/// as `commands/boot.rs`; `get_or_try_init` is unstable).
static SERVER_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn server_url_mutex() -> &'static Mutex<Option<String>> {
    SERVER_URL.get_or_init(|| Mutex::new(None))
}

/// Bind the loopback listener (random free port) and spawn the accept loop.
/// Idempotent — `media_server_url` can be called repeatedly.
fn ensure_server(app: tauri::AppHandle) -> Result<String, AppError> {
    if let Some(url) = server_url_mutex()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
    {
        return Ok(url);
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::Io(format!("media server bind: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Io(format!("media server addr: {e}")))?
        .port();

    let handle = app.clone();
    std::thread::Builder::new()
        .name("media-server".into())
        .spawn(move || {
            for conn in listener.incoming() {
                let Ok(stream) = conn else { continue };
                let h = handle.clone();
                // Per-connection handler thread: media requests are short
                // ranged reads; `Connection: close` per response avoids
                // persistent-socket bookkeeping on a raw TcpListener.
                std::thread::spawn(move || handle_connection(stream, h));
            }
        })
        .map_err(|e| AppError::Other(format!("media server thread: {e}")))?;

    let url = format!("http://127.0.0.1:{port}");
    *server_url_mutex()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(url.clone());
    Ok(url)
}

/// Return the base URL of the loopback media server (ADR-034 part A).
#[tauri::command]
pub fn media_server_url(app: tauri::AppHandle, _state: State<AppState>) -> AppResult<String> {
    ensure_server(app)
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

#[derive(Default, Debug, PartialEq)]
struct ParsedRequest {
    /// Decoded `path` query parameter (absolute file path on disk).
    path: Option<String>,
    /// Raw `Range` header value, if present.
    range: Option<String>,
}

/// Parse the first line + headers of an HTTP/1.1 request. Returns `None` for
/// anything malformed or non-GET.
fn parse_request(raw: &str) -> Option<ParsedRequest> {
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
fn percent_decode(s: &str) -> String {
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

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Path-traversal guard: canonicalize the requested path and require it to
/// resolve strictly inside `vault_root`. Also rejects non-files and paths
/// that don't exist.
fn resolve_vault_path(target: &str, vault_root: &Path) -> Option<PathBuf> {
    let root = vault_root.canonicalize().ok()?;
    let candidate = PathBuf::from(target);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let canonical = candidate.canonicalize().ok()?;
    if canonical.starts_with(&root) && canonical.is_file() {
        Some(canonical)
    } else {
        None
    }
}

/// MIME table mirroring the editor's `classifyMediaExtension` (ADR-034). Only
/// known media is served — anything else resolves to octet-stream and is
/// refused, so the server can never be used to read arbitrary vault files.
fn mime_for(path: &Path) -> &'static str {
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
struct ResponsePlan {
    status: u16,
    headers: Vec<(String, String)>,
    range: Option<(u64, u64)>,
}

fn plan_response(parsed: &ParsedRequest, file_size: u64, mime: &str) -> ResponsePlan {
    let mut headers = vec![
        ("Content-Type".to_string(), mime.to_string()),
        ("Accept-Ranges".to_string(), "bytes".to_string()),
        ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
    ];

    match parsed.range.as_deref() {
        Some(range_header) => {
            let ranges = http_range::HttpRange::parse(range_header, file_size);
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

/// Route a single HTTP request to a response on `stream`.
fn handle_connection(mut stream: TcpStream, app: tauri::AppHandle) {
    let Some(raw) = read_request(&mut stream) else {
        return;
    };
    let Some(parsed) = parse_request(&raw) else {
        write_error(&mut stream, 400, "Bad Request");
        return;
    };
    let Some(path) = parsed.path.clone() else {
        write_error(&mut stream, 400, "Bad Request");
        return;
    };

    let root = match app.state::<AppState>().vault_path.read() {
        Ok(guard) => guard.clone().map(PathBuf::from),
        Err(_) => None,
    };
    let Some(root) = root else {
        write_error(&mut stream, 404, "Not Found");
        return;
    };

    let Some(file_path) = resolve_vault_path(&path, &root) else {
        write_error(&mut stream, 404, "Not Found");
        return;
    };

    let mime = mime_for(&file_path);
    if mime == "application/octet-stream" {
        // Not a known media type — refuse rather than leak arbitrary files.
        write_error(&mut stream, 404, "Not Found");
        return;
    }

    let meta = match std::fs::metadata(&file_path) {
        Ok(m) => m,
        Err(_) => {
            write_error(&mut stream, 404, "Not Found");
            return;
        }
    };
    let plan = plan_response(&parsed, meta.len(), mime);
    write_response(&mut stream, &plan, &file_path);
}

/// Read the request head (up to a 16 KiB cap) until the blank line.
fn read_request(stream: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::with_capacity(1024);
    let mut tmp = [0u8; 512];
    loop {
        match stream.read(&mut tmp) {
            Ok(0) => return None,
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 16 * 1024 {
                    break;
                }
            }
            Err(_) => return None,
        }
    }
    String::from_utf8(buf).ok()
}

fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        206 => "Partial Content",
        400 => "Bad Request",
        404 => "Not Found",
        416 => "Range Not Satisfiable",
        _ => "Error",
    }
}

/// Write status line + headers, then stream the planned byte range straight
/// from the file in 64 KiB chunks (no full-body buffering — videos can be
/// multi-GB).
fn write_response(stream: &mut TcpStream, plan: &ResponsePlan, file_path: &Path) {
    let mut head = format!("HTTP/1.1 {} {}\r\n", plan.status, status_text(plan.status));
    for (k, v) in &plan.headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("Connection: close\r\n\r\n");
    if stream.write_all(head.as_bytes()).is_err() {
        return;
    }

    let Some((start, len)) = plan.range else {
        return;
    };
    let Ok(mut file) = std::fs::File::open(file_path) else {
        return;
    };
    if file.seek(SeekFrom::Start(start)).is_err() {
        return;
    }
    let mut buf = [0u8; 64 * 1024];
    let mut remaining = len;
    while remaining > 0 {
        let chunk = remaining.min(buf.len() as u64) as usize;
        match file.read(&mut buf[..chunk]) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buf[..n]).is_err() {
                    return;
                }
                remaining -= n as u64;
            }
            Err(_) => break,
        }
    }
}

fn write_error(stream: &mut TcpStream, status: u16, msg: &str) {
    let body = format!("HTTP/1.1 {status} {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", status_text(status), msg.len(), msg);
    let _ = stream.write_all(body.as_bytes());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn traversal_guard_blocks_escape_from_vault() {
        let root = std::env::temp_dir().join("basalt-media-test");
        std::fs::create_dir_all(&root).unwrap();
        let ok = root.join("ok.png");
        std::fs::write(&ok, [1, 2, 3]).unwrap();

        let inside = resolve_vault_path(&ok.to_string_lossy(), &root);
        assert_eq!(inside, Some(ok));

        // Absolute path outside the vault root.
        let outside = std::env::temp_dir().join("basalt-outside.png");
        std::fs::write(&outside, [1, 2, 3]).unwrap();
        assert_eq!(resolve_vault_path(&outside.to_string_lossy(), &root), None);

        // Relative `..` escape.
        assert_eq!(resolve_vault_path("../basalt-outside.png", &root), None);

        // Nonexistent path inside the vault.
        assert_eq!(
            resolve_vault_path(&root.join("missing.png").to_string_lossy(), &root),
            None
        );

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&outside);
    }
}
