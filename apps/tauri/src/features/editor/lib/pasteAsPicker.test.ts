import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AmbiguousPasteRequest } from "@workspace/editor";

describe("pasteAsPicker store", () => {
  let mod: typeof import("./pasteAsPicker");
  let request: AmbiguousPasteRequest;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("./pasteAsPicker");
    request = {
      options: [
        { id: "keep-formatting", label: "Keep formatting" },
        { id: "plain-text", label: "Plain text" },
      ],
      defaultId: "keep-formatting",
      anchor: { x: 10, y: 20 },
    };
  });

  it("records the pending request and exposes it", () => {
    expect(mod.getPendingPasteAs()).toBeNull();
    mod.showPasteAsPicker(request, vi.fn());
    expect(mod.getPendingPasteAs()?.request).toBe(request);
  });

  it("choosing resolves with the picked flavor and clears pending", () => {
    const resolve = vi.fn();
    mod.showPasteAsPicker(request, resolve);
    mod.choosePasteAs("plain-text");
    expect(resolve).toHaveBeenCalledWith("plain-text");
    expect(mod.getPendingPasteAs()).toBeNull();
  });

  it("dismissing resolves with null (keep default) and clears pending", () => {
    const resolve = vi.fn();
    mod.showPasteAsPicker(request, resolve);
    mod.dismissPasteAsPicker();
    expect(resolve).toHaveBeenCalledWith(null);
    expect(mod.getPendingPasteAs()).toBeNull();
  });

  it("subscribers are notified when a request lands", () => {
    const listener = vi.fn();
    const unsubscribe = mod.subscribePasteAsPicker(listener);
    mod.showPasteAsPicker(request, vi.fn());
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    mod.showPasteAsPicker({ ...request, defaultId: "plain-text" }, vi.fn());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("no-ops when nothing is pending", () => {
    expect(() => mod.choosePasteAs("plain-text")).not.toThrow();
    expect(() => mod.dismissPasteAsPicker()).not.toThrow();
  });
});
