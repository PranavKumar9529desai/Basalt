//! Loopback media server — serves vault files over `http://127.0.0.1:<port>`.
//!
//! ADR-034 part A: WebKitGTK's media pipeline (GStreamer) has no handler for
//! Tauri's `asset://` scheme, so `<video>`/`<audio>` never load on Linux even
//! when every system codec is installed (WebKit bug 146351, tauri#3725). The
//! durable workaround is a tiny loopback HTTP listener with Range/206 support,
//! which GStreamer plays reliably. macOS/Windows keep `asset://` and never
//! call this server.

mod http;
mod server;

pub use server::media_server_url;
