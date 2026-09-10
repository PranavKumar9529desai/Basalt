/**
 * Shared path and filename utilities (Frontend parity with Rust `basalt-types::path_utils`).
 */

/**
 * Returns the final component of a path (filename or leaf directory).
 * Handles both POSIX ("/") and Windows ("\\") path separators.
 *
 * @example
 * basename("docs/notes/meeting.md") // "meeting.md"
 * basename("notes\\ideas.canvas")   // "ideas.canvas"
 * basename("untitled")              // "untitled"
 */
export function basename(path: string): string {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.pop() || normalized;
}

/**
 * Returns the file stem (filename without its trailing extension).
 *
 * @example
 * stemOf("docs/notes/meeting.md") // "meeting"
 * stemOf("ideas.canvas")          // "ideas"
 * stemOf("archive.tar.gz")        // "archive.tar"
 */
export function stemOf(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return base;
  return base.slice(0, dotIndex);
}

/**
 * Checks if a path or filename ends with a Markdown extension (`.md`). Case-insensitive.
 */
export function isMarkdownPath(path: string): boolean {
  if (!path) return false;
  return /\.md$/i.test(path);
}

/**
 * Checks if a path or filename ends with a Canvas extension (`.canvas`). Case-insensitive.
 */
export function isCanvasPath(path: string): boolean {
  if (!path) return false;
  return /\.canvas$/i.test(path);
}

/**
 * Checks if a path is a primary Basalt document type (Markdown or Canvas).
 */
export function isDocumentPath(path: string): boolean {
  return isMarkdownPath(path) || isCanvasPath(path);
}

/**
 * Normalizes a path to forward slashes and strips leading/trailing slashes.
 */
export function normalizePath(path: string): string {
  if (!path) return "";
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}
