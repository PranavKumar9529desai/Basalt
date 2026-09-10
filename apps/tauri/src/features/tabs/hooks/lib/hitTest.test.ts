import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTabsStore } from "../../store";
import { collectLeaves } from "../../lib/layoutTree";
import { useTabDnD, resetTabDnDStateForTests } from "../useTabDnD";
import {
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

describe("hitTest", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
    resetHitTesting();
  });

  describe("pointer-event drag (WebKitGTK path, ADR-032)", () => {
    it("dragging past the threshold starts the drag and exposes hoverTarget", () => {
      const { result } = renderHook(() => useTabDnD());
      const { paneId } = seedPane(["a", "b", "c"]);
      hookHandlePointerDown(result);
      pointerDown("c", 100, 100);
      pointerMove(106, 106); // 6px > 5px threshold → drag starts
      expect(result.current.isDraggingTab).toBe(true);
      expect(result.current.dragState?.tabId).toBe("c");

      setHit(makeEl({ tabId: "a", tabPaneId: paneId }), {
        left: 50,
        width: 100,
      });
      pointerMove(60, 106); // over "a"'s left half → left slot
      expect(result.current.dragState?.hoverTarget).toEqual({
        kind: "tab",
        tabId: "a",
        paneId,
        edge: "left",
      });

      setHit(null);
      pointerUp(60, 106);
      expect(result.current.isDraggingTab).toBe(false);
      expect(result.current.dragState).toBe(null);
    });

    it("dropping in the tab strip gutter snaps to the nearest pill slot", () => {
      const { result } = renderHook(() => useTabDnD());
      const { moveTabWithinPane, paneId } = seedPane(["a", "b", "c"]);
      hookHandlePointerDown(result);
      pointerDown("a", 100, 100);
      pointerMove(106, 106);

      // Cursor lands on the tablist root, not on any pill.
      const tablist = makeEl({});
      tablist.setAttribute("role", "tablist");
      const pillC = makeEl({ tabId: "c", tabPaneId: paneId });
      tablist.append(pillC);
      pillC.getBoundingClientRect = () =>
        ({ left: 200, top: 0, width: 100, height: 24 }) as DOMRect;

      setHit(tablist);
      pointerMove(260, 106); // right of pill "c"'s center → its right edge
      expect(result.current.dragState?.hoverTarget).toEqual({
        kind: "tab",
        tabId: "c",
        paneId,
        edge: "right",
      });
      pointerUp(260, 106);
      expect(moveTabWithinPane).toHaveBeenCalledWith(0, 2);
    });

    it("dropping on a pane body appends the tab to that pane", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
        s.openPinned({ path: "b.md" });
        s.splitActivePane("vertical"); // right pane = clone of active "b"
      });
      const leaves = collectLeaves(useTabsStore.getState().root);
      const left = leaves.find((l) => l.tabGroup.tabIds.includes("tab:a.md"))!;
      const right = leaves.find((l) => l.id !== left.id)!;

      const { result } = renderHook(() => useTabDnD());
      hookHandlePointerDown(result);
      pointerDown("tab:a.md", 50, 50);
      pointerMove(60, 60);

      setHit(makeEl({ basaltPaneBody: "", paneId: right.id }), {
        left: 0,
        top: 60,
        width: 400,
        height: 400,
      });
      pointerMove(200, 260); // dead center → pane-body, not an edge wedge
      expect(result.current.dragState?.hoverTarget).toEqual({
        kind: "pane-body",
        paneId: right.id,
      });
      pointerUp(200, 260);

      const afterRight = collectLeaves(useTabsStore.getState().root).find(
        (l) => l.id === right.id,
      )!;
      expect(afterRight.tabGroup.tabIds).toContain("tab:a.md");
      expect(useTabsStore.getState().activePaneId).toBe(right.id);
      expect(result.current.isDraggingTab).toBe(false);
    });

    it("dropping on a pane's left edge wedge splits it into columns", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      hookHandlePointerDown(result);
      pointerDown("tab:a.md", 50, 50);
      pointerMove(60, 60);

      setHit(makeEl({ basaltPaneBody: "", paneId }), {
        left: 0,
        top: 60,
        width: 400,
        height: 400,
      });
      pointerMove(30, 200); // x < width/4 → left edge wedge
      expect(result.current.dragState?.hoverTarget).toEqual({
        kind: "edge",
        edge: "left",
        paneId,
      });
      pointerUp(30, 200);

      const root = useTabsStore.getState().root;
      expect(root.type).toBe("split");
      const leaves = collectLeaves(root);
      expect(leaves[0].tabGroup.tabIds).toEqual(["tab:a.md"]);
      expect(useTabsStore.getState().activePaneId).toBe(leaves[0].id);
    });

    it("a drag over its own pill produces no hover target (self-drop no-op)", () => {
      const { result } = renderHook(() => useTabDnD());
      const { paneId } = seedPane(["a", "b"]);
      hookHandlePointerDown(result);
      pointerDown("a", 100, 100);
      pointerMove(110, 110);
      setHit(makeEl({ tabId: "a", tabPaneId: paneId }), {
        left: 50,
        width: 100,
      });
      pointerMove(60, 110);
      expect(result.current.dragState?.hoverTarget).toBe(null);
      pointerUp(60, 110);
    });
  });
});
