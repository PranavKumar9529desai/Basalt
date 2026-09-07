/**
 * Media server URL helper (ADR-034 part A).
 *
 * On Linux, WebKitGTK's media pipeline (GStreamer) has no handler for Tauri's
 * `asset://` scheme, so `<video>`/`<audio>` never play there. The Rust backend
 * starts a loopback HTTP server on a random port; this module fetches its base
 * URL once at boot and builds media URLs from it. `convertFileSrc` (`asset://`)
 * stays in use on macOS/Windows where it works.
 */

import { invoke } from "@tauri-apps/api/core";

let cachedUrl: string | null = null;
let fetchPromise: Promise<void> | null = null;

/** Fetch the media server base URL once (memoized), off the boot path. */
export function ensureMediaServerUrl(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = invoke<string>("media_server_url")
    .then((url) => {
      cachedUrl = url;
    })
    .catch((err) => {
      // Non-fatal: embeds fall back to the chip. macOS/Windows never call this.
      console.error("[mediaServer] media_server_url failed:", err);
      cachedUrl = null;
    });
  return fetchPromise;
}

/** Cached media server base URL, or null if not yet fetched / unavailable. */
export function getMediaServerUrl(): string | null {
  return cachedUrl;
}

/** True on Linux — the only platform where the loopback server is used. */
export function isLinux(): boolean {
  return /Linux/i.test(navigator.userAgent);
}

/** Build the media URL for an absolute file path (`/media?path=<abs>`). */
export function mediaUrlFor(absPath: string): string | null {
  const base = getMediaServerUrl();
  if (!base) return null;
  return `${base}/media?path=${encodeURIComponent(absPath)}`;
}
