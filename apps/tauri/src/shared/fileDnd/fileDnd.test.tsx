import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real features/editor barrel pulls in packages/editor, which fails to
// import under vitest on this branch (math grammar WIP). drop.ts only needs
// editorControllerRegistry.forEach — mock the registry with the same API.
const { editorRegistryMock } = vi.hoisted(() => {
  const controllers = new Map<string, unknown>();
  return {
    editorRegistryMock: {
      register: (paneId: string, controller: unknown) =>
        void controllers.set(paneId, controller),
      unregister: (paneId: string) => void controllers.delete(paneId),
      forEach: (fn: (controller: unknown) => void) =>
        controllers.forEach((controller) => fn(controller)),
    },
  };
});

vi.mock("../../features/editor", () => ({
  editorControllerRegistry: editorRegistryMock,
}));

// The canvas barrel pulls in CanvasView → CanvasCardEditor → packages/editor
// (same WIP breakage); drop.ts only needs canvasFileDropAt.
vi.mock("../../features/canvas", () => ({
  canvasFileDropAt: vi.fn(),
}));
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

const pointerEvent = (type: string, x: number, y: number, button = 0) =>
  new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });

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

describe("fileDnd editor drop", () => {
  const view = {
    dom: null as unknown as Element,
    dispatch: vi.fn(),
    focus: vi.fn(),
    state: { selection: { main: { head: 4 } } },
  };
  const editorEl = {
    closest: (sel: string) => (sel === ".cm-editor" ? editorEl : null),
  } as unknown as Element;

  beforeEach(() => {
    resetFileDnDStateForTests();
    view.dispatch.mockClear();
    view.focus.mockClear();
    view.dom = editorEl;
    document.elementFromPoint = () => editorEl;
    editorRegistryMock.register("pane-1", {
      getView: () => view,
    } as never);
  });

  afterEach(() => {
    editorRegistryMock.unregister("pane-1");
  });

  it("dropping on an editor inserts [[wikilink]] at the caret", () => {
    const { result } = renderHook(() => useFileDrag());
    hookHandlePointerDown(result)(NOTE, 100, 100);
    pointerMove(108, 108);
    pointerUp(108, 108);
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 4, insert: "[[intro]]" },
    });
    expect(view.focus).toHaveBeenCalled();
    // The drop executed and the session is fully cleared.
    expect(result.current.isDraggingFile).toBe(false);
  });

  it("a drop outside any editor or canvas is a no-op", () => {
    document.elementFromPoint = () => null;
    const { result } = renderHook(() => useFileDrag());
    hookHandlePointerDown(result)(NOTE, 100, 100);
    pointerMove(108, 108);
    pointerUp(108, 108);
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
