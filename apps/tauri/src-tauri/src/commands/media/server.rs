//! Loopback HTTP media server: bind/listen lifecycle, connection routing, and
//! byte-range streaming (ADR-034 part A). Request parsing and response
//! planning live in `super::http`.

use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use tauri::{Manager, State};

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::http::{mime_for, parse_request, plan_response, ResponsePlan};

/// Lazily-started server base URL (same `LazyLock<Mutex<Option<…>>>` shape
/// as `commands/boot.rs`). The server binds once; later calls return the
/// cached URL.
static SERVER_URL: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Bind the loopback listener (random free port) and spawn the accept loop.
/// Idempotent — `media_server_url` can be called repeatedly.
fn ensure_server(app: tauri::AppHandle) -> Result<String, AppError> {
    if let Some(url) = SERVER_URL
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
    *SERVER_URL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(url.clone());
    Ok(url)
}

/// Return the base URL of the loopback media server (ADR-034 part A).
#[tauri::command]
pub fn media_server_url(app: tauri::AppHandle, _state: State<AppState>) -> AppResult<String> {
    ensure_server(app)
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

#[cfg(test)]
mod tests {
    use super::*;

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
