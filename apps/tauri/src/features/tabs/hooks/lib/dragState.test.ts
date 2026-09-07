import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTabsStore } from "../../store";
import { useTabDnD, resetTabDnDStateForTests } from "../useTabDnD";
import {
  dragEvent,
  seedPane,
  pointerDown,
  pointerMove,
  pointerUp,
  setHit,
  makeEl,
  hookHandlePointerDown,
  resetHitTesting,
} from "./testUtils";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

describe("dragState", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
    resetHitTesting();
  });

  it("sets isDraggingTab on drag start and clears it on drag end", () => {
    const { result } = renderHook(() => useTabDnD());
    seedPane(["a"]);
    act(() => result.current.handleTabDragStart("a", dragEvent()));
    expect(result.current.isDraggingTab).toBe(true);
    act(() => result.current.handleTabDragEnd(dragEvent()));
    expect(result.current.isDraggingTab).toBe(false);
  });

  it("isDraggingTab is shared across hook instances (module drag state)", () => {
    const first = renderHook(() => useTabDnD());
    const second = renderHook(() => useTabDnD());
    seedPane(["a"]);
    act(() => first.result.current.handleTabDragStart("a", dragEvent()));
    // A second instance — the pane the drop will land on — sees the drag too.
    expect(second.result.current.isDraggingTab).toBe(true);
    act(() => first.result.current.handleTabDragEnd(dragEvent()));
    expect(second.result.current.isDraggingTab).toBe(false);
  });

  describe("pointer-event drag (WebKitGTK path, ADR-032)", () => {
    it("a plain click (below the move threshold) never starts a drag", () => {
      const { result } = renderHook(() => useTabDnD());
      seedPane(["a", "b"]);
      hookHandlePointerDown(result);
      pointerDown("a", 100, 100);
      pointerMove(103, 103); // 3px < 5px threshold
      expect(result.current.isDraggingTab).toBe(false);
      expect(result.current.dragState).toBe(null);
      pointerUp(103, 103);
      expect(result.current.isDraggingTab).toBe(false);
    });

    it("Escape cancels an in-flight pointer drag without dropping", () => {
      const { result } = renderHook(() => useTabDnD());
      const { moveTabWithinPane } = seedPane(["a", "b", "c"]);
      hookHandlePointerDown(result);
      pointerDown("c", 100, 100);
      pointerMove(106, 106);
      expect(result.current.isDraggingTab).toBe(true);

      setHit(makeEl({ tabId: "a", tabPaneId: "leaf-1" }), {
        left: 50,
        width: 100,
      });
      pointerMove(60, 106);
      act(() =>
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
      );
      expect(result.current.isDraggingTab).toBe(false);
      expect(result.current.dragState).toBe(null);

      // The window listeners are gone: a late pointerup does nothing.
      pointerUp(60, 106);
      expect(moveTabWithinPane).not.toHaveBeenCalled();
    });
  });
});