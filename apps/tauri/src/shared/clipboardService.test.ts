import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardService } from "./clipboardService";

/**
 * Tests for the typed (in-memory) clipboard semantics + OS-text/typed
 * coupling. System-clipboard calls are mocked — the real IPC path needs
 * a running Tauri app and is exercised by the manual checklist.
 */
describe("clipboardService typed store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function freshService(): Promise<{ svc: ClipboardService; keys: typeof CLIPBOARD_KEYS }> {
    const { clipboardService, CLIPBOARD_KEYS } = await import("./clipboardService");
    clipboardService.clearAllTyped();
    return { svc: clipboardService, keys: CLIPBOARD_KEYS };
  }

  it("stores and reads typed entries", async () => {
    const { svc, keys } = await freshService();
    svc.writeTyped(keys.VAULT_FILES, { operation: "cut", paths: ["a.md", "b.md"] });
    expect(svc.readTyped(keys.VAULT_FILES)).toEqual({ operation: "cut", paths: ["a.md", "b.md"] });
    expect(svc.hasTyped(keys.VAULT_FILES)).toBe(true);
  });

  it("single-slot semantics: writing a new key clears the previous one", async () => {
    const { svc, keys } = await freshService();
    svc.writeTyped(keys.VAULT_FILES, { operation: "cut", paths: ["a.md"] });
    svc.writeTyped(keys.CANVAS_NODES, { snapshot: [] });
    expect(svc.hasTyped(keys.VAULT_FILES)).toBe(false);
    expect(svc.hasTyped(keys.CANVAS_NODES)).toBe(true);
  });

  it("clearTyped removes only the given key", async () => {
    const { svc, keys } = await freshService();
    svc.writeTyped(keys.VAULT_FILES, { operation: "cut", paths: ["a.md"] });
    svc.writeTyped(keys.EDITOR_SELECTION, { text: "x" });
    svc.clearTyped(keys.VAULT_FILES);
    expect(svc.hasTyped(keys.VAULT_FILES)).toBe(false);
    expect(svc.hasTyped(keys.EDITOR_SELECTION)).toBe(true);
  });

  it("clearAllTyped empties the store", async () => {
    const { svc, keys } = await freshService();
    svc.writeTyped(keys.VAULT_FILES, { operation: "cut", paths: ["a.md"] });
    svc.clearAllTyped();
    expect(svc.hasTyped(keys.VAULT_FILES)).toBe(false);
  });

  it("a genuine document copy event invalidates typed state", async () => {
    const { svc, keys } = await freshService();
    svc.writeTyped(keys.VAULT_FILES, { operation: "cut", paths: ["a.md"] });
    document.dispatchEvent(new Event("copy"));
    expect(svc.hasTyped(keys.VAULT_FILES)).toBe(false);
  });
});