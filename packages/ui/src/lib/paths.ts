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
  if (/\.excalidraw\.md$/i.test(base)) {
    return base.slice(0, -".excalidraw.md".length);
  }
  if (/\.excalidraw$/i.test(base)) {
    return base.slice(0, -".excalidraw".length);
  }
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return base;
  return base.slice(0, dotIndex);
}

/**
 * Returns the file extension without the dot, lowercased (`""` when none).
 *
 * @example
 * extensionOf("docs/notes/meeting.md") // "md"
 * extensionOf("archive.tar.gz")        // "gz" (last suffix only)
 * extensionOf("untitled")              // ""
 */
export function extensionOf(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return base.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns the path's components with empty segments removed (leading,
 * trailing, and duplicate separators), normalized to forward slashes.
 *
 * @example
 * segmentsOf("/docs//notes/meeting.md/") // ["docs", "notes", "meeting.md"]
 * segmentsOf("untitled")                 // ["untitled"]
 * segmentsOf("")                         // []
 */
export function segmentsOf(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .filter((s) => s.length > 0);
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
 * Checks if a path or filename is a Drawing document (`.excalidraw.md` or
 * `.excalidraw`). Case-insensitive.
 */
export function isDrawingPath(path: string): boolean {
  if (!path) return false;
  return /\.excalidraw\.md$/i.test(path) || /\.excalidraw$/i.test(path);
}

/**
 * Checks if a path is a primary Basalt document type (Markdown, Canvas, or Drawing).
 */
export function isDocumentPath(path: string): boolean {
  return isMarkdownPath(path) || isCanvasPath(path) || isDrawingPath(path);
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
