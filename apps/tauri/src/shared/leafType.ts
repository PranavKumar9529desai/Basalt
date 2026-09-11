/**
 * Marker-authoritative leaf-type resolution.
 *
 * The leaf registry routes by extension (fast path, zero IO). But a drawing
 * renamed to a plain name (`carfleet.md`) still carries the Obsidian
 * Excalidraw marker in its frontmatter — extension routing would open it as
 * markdown and show the raw scene blob as prose. For ambiguous `.md` files we
 * ask Rust (one head read) whether the file is a drawing.
 */

import { invoke } from "@tauri-apps/api/core";
import { leafRegistry } from "@workspace/views";

/**
 * Resolve the leaf type for a path: sync extension fast path first; for plain
 * `.md` files the frontmatter marker is the judge. Falls back to `"markdown"`
 * on any classification error (unreadable file, vanished path).
 */
export async function resolveLeafType(path: string): Promise<string> {
  const base = leafRegistry.leafTypeForPath(path) ?? "markdown";
  if (base !== "markdown") return base;
  try {
    const isDrawing = await invoke<boolean>("is_drawing_file", { path });
    return isDrawing ? "drawing" : "markdown";
  } catch {
    return "markdown";
  }
}
