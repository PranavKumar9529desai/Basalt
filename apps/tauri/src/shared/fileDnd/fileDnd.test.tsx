import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useFileDrag, resetFileDnDStateForTests } from "./index";
import type { FlatTreeNode } from "../../features/vault";

const NOTE: FlatTreeNode = {
  name: "intro.md",
  path: "/vault/intro.md",
  relPath: "intro.md",
  kind: "file",
  depth: 0,
  childCount: 0,
};

const pointerEvent = (
  type: string,
  x: number,
  y: number,
  button = 0,
) => new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });

function hookHandlePointerDown(result: {
  current: ReturnType<typeof useFileDrag>;
}) {
  return (node: FlatTreeNode, x: number, y: number) =>
    act(() =>
      result.current.handleFilePointerDown(
        node,
        pointerEvent("pointerdown", x, y) as unknown as React.PointerEvent,
      ),
    );
}

function pointerMove(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointermove", x, y)));
}

function pointerUp(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointerup", x, y)));
}

describe("fileDnd drag state (WebKitGTK pointer path)", () => {
  beforeEach(() => {
    resetFileDnDStateForTests();
    // jsdom has no elementFromPoint; the drag-state tests treat any drop as
    // a no-op (the drop-target routing is covered elsewhere).
    document.elementFromPoint = () => null;
  });

  it("a plain click (below the move threshold) never starts a drag", () => {
    const { result } = renderHook(() => useFileDrag());
    hookHandlePointerDown(result)(NOTE, 100, 100);
    pointerMove(103, 103); // 3px < 5px threshold
    expect(result.current.isDraggingFile).toBe(false);
    pointerUp(103, 103);
    expect(result.current.isDraggingFile).toBe(false);
  });

  it("isDraggingFile is shared across hook instances (module drag state)", () => {
    const first = renderHook(() => useFileDrag());
    const second = renderHook(() => useFileDrag());
    hookHandlePointerDown(first.result)(NOTE, 100, 100);
    pointerMove(108, 108); // past threshold
    expect(second.result.current.isDraggingFile).toBe(true);
    pointerUp(108, 108);
    expect(second.result.current.isDraggingFile).toBe(false);
  });

  it("Escape cancels an in-flight drag and leaves no drag state", () => {
    const { result } = renderHook(() => useFileDrag());
    hookHandlePointerDown(result)(NOTE, 100, 100);
    pointerMove(108, 108);
    expect(result.current.isDraggingFile).toBe(true);

    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(result.current.isDraggingFile).toBe(false);

    // Window listeners are gone: a late pointerup does nothing.
    pointerUp(108, 108);
    expect(result.current.isDraggingFile).toBe(false);
  });
});
