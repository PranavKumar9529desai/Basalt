// Canvas clipboard — feature-local copy/paste (Option A, see
// docs/clipboard-research.md §3). Two channels:
// 1. Internal typed store (session-only, module-scope map — the feature owns
//    its clipboard, no shared-layer imports) carrying node JSON snapshots so
//    a copy pastes into any canvas and repeats cascade with an offset.
// 2. The OS clipboard (text/plain, image, text/uri-list) so copies land in
//    notes and other apps, and pastes pull real files/images into the canvas.

import type { Edge } from "@xyflow/react";
import type { CanvasDocument, CanvasNode } from "../types";
import type { CanvasXYNode } from "./mapper";
import { mapToCanvasDocument } from "./mapper";
import { normalizePath } from "@workspace/ui";

/** Key for canvas node snapshots in the feature-local typed store. */
export const CANVAS_NODES_KEY = "canvas:nodes" as const;

/** Offset applied on every paste so repeated pastes cascade (Obsidian-style). */
export const CANVAS_PASTE_OFFSET = 80;

export interface CanvasClipboardSnapshot {
  v: 1;
  doc: CanvasDocument;
}

// ---------- Feature-local typed store ----------

const typed = new Map<string, unknown>();

export function writeCanvasTyped(key: string, value: unknown): void {
  typed.set(key, value);
}

export function readCanvasTyped<T = unknown>(key: string): T | null {
  return (typed.get(key) as T | undefined) ?? null;
}

// ---------- Snapshot (copy) ----------

/** Snapshot the current selection as a versioned canvas document. Returns
 *  null when nothing is selected (caller then falls back to the default
 *  copy behavior). */
export function buildCanvasSnapshot(
  nodes: CanvasXYNode[],
  edges: Edge[],
): CanvasClipboardSnapshot | null {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length === 0) return null;
  return { v: 1, doc: mapToCanvasDocument(selected, edges) };
}

/** Vault-relative path minus its trailing extension, directory segments kept
 *  (`"notes/My note.md"` → `"notes/My note"`). Unlike `stemOf` (basename
 *  only) this keeps folders — wikilinks reference the full note path. */
function pathWithoutExt(path: string): string {
  const normalized = normalizePath(path);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) return normalized;
  return normalized.slice(0, dotIndex);
}

/** Plain-text form of a snapshot: file nodes as `[[wikilink]]` (extension
 *  removed), links as URLs, text nodes as their content. Pasting a canvas
 *  copy into a note thus inserts usable links. */
export function plainTextOfDocument(doc: CanvasDocument): string {
  return (doc.nodes ?? [])
    .map((n) => {
      if (n.type === "file") return `[[${pathWithoutExt(n.file)}]]`;
      if (n.type === "link") return n.url;
      if (n.type === "text") return n.text;
      return "";
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

/** Offset every node by CANVAS_PASTE_OFFSET and assign fresh ids so repeated
 *  pastes cascade. Snapshot edges are remapped through the id map; edges to
 *  nodes outside the selection are dropped. */
export function remapSnapshotForPaste(
  snapshot: CanvasClipboardSnapshot,
): CanvasDocument {
  const salt = Date.now();
  const idMap = new Map<string, string>();
  const nodes: CanvasNode[] = (snapshot.doc.nodes ?? []).map((n, i) => {
    const freshId = `${n.type}-${salt}-${i}`;
    idMap.set(n.id, freshId);
    return {
      ...n,
      id: freshId,
      x: n.x + CANVAS_PASTE_OFFSET,
      y: n.y + CANVAS_PASTE_OFFSET,
    };
  });
  const edges = (snapshot.doc.edges ?? [])
    .map((e) => ({
      ...e,
      id: `${e.id}-${salt}`,
      fromNode: idMap.get(e.fromNode) ?? "",
      toNode: idMap.get(e.toNode) ?? "",
    }))
    .filter((e) => e.fromNode !== "" && e.toNode !== "");
  return { nodes, edges };
}

// ---------- OS clipboard payload ----------

/** True when the event target is a place where Ctrl+C/V must mean text
 *  (an input or editable — e.g. the link-node URL field or the card editor). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.getAttribute("contenteditable") !== null ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  );
}

/** `file:///home/u/a.png` → `/home/u/a.png`; plain paths pass through. */
export function fileUriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(uri.slice("file://".length));
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|tiff?)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i;

/** Broad media classification for node sizing — the FileNode card renders
 *  audio and images at content-appropriate dimensions. */
export function classifyFileType(
  relPath: string,
): "image" | "audio" | "file" {
  if (IMAGE_EXT_RE.test(relPath)) return "image";
  if (AUDIO_EXT_RE.test(relPath)) return "audio";
  return "file";
}

export interface PastePayload {
  /** First image on the clipboard (raw encoded bytes). */
  image: { bytes: Uint8Array; name: string } | null;
  /** `file://` URIs or OS file paths (file-manager copies). */
  uris: string[];
  /** Plain text, for smart URL → link / path → file / else text card. */
  text: string;
}

/** Test seam — how the feature reads the OS clipboard. */
export interface PasteOsReader {
  readText(): Promise<string>;
  readImage(): Promise<Uint8Array | null>;
  readUriList(): Promise<string[]>;
}

/** Browser/Tauri default reader: `navigator.clipboard.read()` covers images
 *  and `text/uri-list`; readText covers plain text. */
export const navigatorPasteOsReader: PasteOsReader = {
  async readText() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  },
  async readImage() {
    try {
      const items = await navigator.clipboard.read();
      const mime = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/tiff",
        "image/bmp",
      ].find((t) => items[0]?.types.includes(t));
      if (mime) {
        const blob = await items[0].getType(mime);
        return new Uint8Array(await blob.arrayBuffer());
      }
    } catch {
      // Unavailable; caller falls back to an empty payload.
    }
    return null;
  },
  async readUriList() {
    try {
      const items = await navigator.clipboard.read();
      if (items[0]?.types.includes("text/uri-list")) {
        const blob = await items[0].getType("text/uri-list");
        const raw = new TextDecoder().decode(await blob.arrayBuffer());
        return raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith("file://"));
      }
    } catch {
      // Unavailable.
    }
    return [];
  },
};

/**
 * Read everything the OS clipboard can offer for a canvas paste. A paste
 * event with a dataTransfer is authoritative (Chromium puts files/images
 * there) and is read on its own; otherwise the OS reader is consulted. Pure
 * of DOM side effects besides encoding; unit-testable with a stubbed reader.
 */
export async function readPastePayload(
  event: ClipboardEvent | null,
  os: PasteOsReader = navigatorPasteOsReader,
): Promise<PastePayload> {
  if (event?.clipboardData) {
    const files = Array.from(event.clipboardData.files ?? []);
    const imageFile = files.find((f) => f.type.startsWith("image/"));
    const image =
      imageFile ?
        {
          bytes: new Uint8Array(await imageFile.arrayBuffer()),
          name: imageFile.name || "pasted-image.png",
        }
      : null;
    const nonImageFiles = files
      .filter((f) => !f.type.startsWith("image/"))
      .map((f) => (f as { path?: string }).path || f.name);
    const uris = event.clipboardData
      .getData("text/uri-list")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("file://"));
    return {
      image,
      uris: [...uris, ...nonImageFiles],
      text: event.clipboardData.getData("text/plain"),
    };
  }

  const bytes = await os.readImage();
  return {
    image: bytes ? { bytes, name: "pasted-image.png" } : null,
    uris: await os.readUriList(),
    text: await os.readText(),
  };
}