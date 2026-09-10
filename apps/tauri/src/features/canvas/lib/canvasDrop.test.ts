import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasFileDropAt, registerCanvasFileDrop } from "./canvasDrop";

function makeEl(rect: {
  left: number;
  top: number;
  right?: number;
  bottom?: number;
}): HTMLElement {
  const right = rect.right ?? rect.left + 400;
  const bottom = rect.bottom ?? rect.top + 300;
  return {
    getBoundingClientRect: () =>
      ({ left: rect.left, top: rect.top, right, bottom }) as DOMRect,
  } as HTMLElement;
}

describe("canvasFileDropAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a drop inside a registered pane to its handler", () => {
    const handler = vi.fn();
    const dom = makeEl({ left: 100, top: 200 }); // 100..500 x 200..500
    const unregister = registerCanvasFileDrop("pane-1", dom, handler);

    const handled = canvasFileDropAt(250, 300, "/vault/intro.md");
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith({
      x: 250,
      y: 300,
      filePath: "/vault/intro.md",
    });

    unregister();
  });

  it("ignores drops outside every registered pane", () => {
    const handler = vi.fn();
    const dom = makeEl({ left: 100, top: 200 });
    registerCanvasFileDrop("pane-1", dom, handler);

    expect(canvasFileDropAt(50, 60, "/vault/a.md")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(canvasFileDropAt(600, 600, "/vault/b.md")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregister removes the pane; other panes keep working", () => {
    const first = vi.fn();
    const second = vi.fn();
    const firstDom = makeEl({ left: 0, top: 0, right: 100, bottom: 100 });
    const secondDom = makeEl({ left: 500, top: 0, right: 900, bottom: 100 });
    const unregisterFirst = registerCanvasFileDrop("pane-1", firstDom, first);
    registerCanvasFileDrop("pane-2", secondDom, second);

    unregisterFirst();
    expect(canvasFileDropAt(50, 50, "/vault/a.md")).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(canvasFileDropAt(700, 50, "/vault/a.md")).toBe(true);
    expect(second).toHaveBeenCalled();
  });
});
