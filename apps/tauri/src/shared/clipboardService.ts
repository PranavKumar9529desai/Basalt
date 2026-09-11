/**
 * ClipboardService — platform-level clipboard abstraction.
 *
 * Three concerns (modeled after VS Code's IClipboardService):
 * 1. OS clipboard read/write (system clipboard, survives restart)
 * 2. Internal typed clipboard (in-memory, session-only) for vault cut,
 *    canvas node snapshots, and editor cross-pane state
 * 3. Image read/write via native plugin
 *
 * Typed entries are cleared:
 * - At application boot (Boot.tsx)
 * - When any feature calls clearTyped / clearAllTyped
 * - When a genuine OS copy/cut happens in the window (so stale "cut"
 *   state doesn't persist when the user copied elsewhere)
 */
// ---------- OS clipboard via Tauri plugin ----------

let _pluginReady = false;
type ClipboardPlugin = typeof import("@tauri-apps/plugin-clipboard-manager");

async function importPlugin(): Promise<ClipboardPlugin | null> {
  if (_pluginReady) return await import("@tauri-apps/plugin-clipboard-manager");
  try {
    const mod = await import("@tauri-apps/plugin-clipboard-manager");
    _pluginReady = true;
    return mod;
  } catch {
    return null;
  }
}

async function osReadText(): Promise<string> {
  const plugin = await importPlugin();
  if (plugin) return plugin.readText();
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

async function osWriteText(text: string): Promise<void> {
  const plugin = await importPlugin();
  if (plugin) {
    await plugin.writeText(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Permission denied; best-effort.
  }
}

async function osWriteHtml(html: string, fallback: string): Promise<void> {
  const plugin = await importPlugin();
  if (plugin) {
    await plugin.writeHtml(html, fallback);
    return;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([fallback], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await osWriteText(fallback);
  }
}

async function osReadImage(): Promise<Uint8Array | null> {
  // Primary: async clipboard API gives raw encoded bytes (PNG/JPEG/GIF/BMP/TIFF).
  try {
    const items = await navigator.clipboard.read();
    const item = items[0];
    const supportedTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/tiff",
      "image/bmp",
    ];
    const mime = supportedTypes.find((t) => item.types.includes(t));
    if (mime) {
      const blob = await item.getType(mime);
      return new Uint8Array(await blob.arrayBuffer());
    }
  } catch {
    // Fall through to plugin.
  }
  // Fallback: Tauri native (returns RGBA pixels — raw encoded not available).
  // Callers that need RGBA → PNG encoding can use the Rust image crate directly.
  try {
    const plugin = await importPlugin();
    if (plugin) {
      const img = await plugin.readImage();
      return img.rgba();
    }
  } catch {
    // Unavailable.
  }
  return null;
}

async function osWriteImage(data: Uint8Array | ArrayBuffer): Promise<void> {
  const plugin = await importPlugin();
  if (plugin) {
    await plugin.writeImage(data);
    return;
  }
  // Web fallback — not commonly needed (canvas copy-image).
}

// ---------- Typed (in-memory, session-only) ----------

/** True while the current call stack is a feature writing typed + then
 *  copying to the OS clipboard (e.g. vault Ctrl+C → writeTyped + execCommand).
 *  Prevents the document 'copy' listener from immediately invalidating
 *  the entry we just wrote. */
let suppressCopyClear = false;

// ---------- Typed entry store ----------

interface TypedEntry {
  value: unknown;
  ts: number;
}

const typed = new Map<string, TypedEntry>();

function clearTypedInternal() {
  typed.clear();
}

// Listen for genuine OS copy/cut — invalidate all typed entries.
// When a feature writes typed AND system clipboard together (vault Ctrl+C),
// it sets suppressCopyClear = true before the DOM copy event fires.
if (typeof document !== "undefined") {
  document.addEventListener("copy", () => {
    if (!suppressCopyClear) clearTypedInternal();
  });
  document.addEventListener("cut", () => {
    if (!suppressCopyClear) clearTypedInternal();
  });
}

// ---------- Typed keys ----------

export const CLIPBOARD_KEYS = {
  VAULT_FILES: "vault:files",
  CANVAS_NODES: "canvas:nodes",
  EDITOR_SELECTION: "editor:selection",
} as const;

// ---------- Service interface ----------

export interface ClipboardService {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  writeHtml(html: string, fallbackText: string): Promise<void>;
  readImage(): Promise<Uint8Array | null>;
  writeImage(data: Uint8Array | ArrayBuffer): Promise<void>;

  writeTyped(key: string, value: unknown): void;
  readTyped<T = unknown>(key: string): T | null;
  hasTyped(key: string): boolean;
  clearTyped(key: string): void;
  clearAllTyped(): void;
}

// ---------- Implementation ----------

class ClipboardServiceImpl implements ClipboardService {
  // --- OS clipboard ---

  async readText(): Promise<string> {
    return osReadText();
  }

  async writeText(text: string): Promise<void> {
    suppressCopyClear = true;
    try {
      await osWriteText(text);
    } finally {
      queueMicrotask(() => {
        suppressCopyClear = false;
      });
    }
  }

  async writeHtml(html: string, fallbackText: string): Promise<void> {
    suppressCopyClear = true;
    try {
      await osWriteHtml(html, fallbackText);
    } finally {
      queueMicrotask(() => {
        suppressCopyClear = false;
      });
    }
  }

  async readImage(): Promise<Uint8Array | null> {
    return osReadImage();
  }

  async writeImage(data: Uint8Array | ArrayBuffer): Promise<void> {
    suppressCopyClear = true;
    try {
      await osWriteImage(data);
    } finally {
      queueMicrotask(() => {
        suppressCopyClear = false;
      });
    }
  }

  // --- Typed (session-only) ---

  writeTyped(key: string, value: unknown): void {
    typed.clear();
    typed.set(key, { value, ts: Date.now() });
  }

  readTyped<T = unknown>(key: string): T | null {
    const entry = typed.get(key);
    return (entry?.value as T) ?? null;
  }

  hasTyped(key: string): boolean {
    return typed.has(key);
  }

  clearTyped(key: string): void {
    typed.delete(key);
  }

  clearAllTyped(): void {
    clearTypedInternal();
  }
}

/** Singleton — module-level export, same pattern as `commandService`. */
export const clipboardService: ClipboardService = new ClipboardServiceImpl();
