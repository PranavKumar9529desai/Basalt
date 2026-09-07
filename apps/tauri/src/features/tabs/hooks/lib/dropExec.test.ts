import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTabsStore } from "../../store";
import { collectLeaves } from "../../lib/layoutTree";
import { useTabDnD, resetTabDnDStateForTests } from "../useTabDnD";
import type { TabId } from "../../types";
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

describe("dropExec", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
    resetHitTesting();
  });

  it("moves a tab left when dropped on an earlier target", () => {
    const { result } = renderHook(() => useTabDnD());
    const { moveTabWithinPane, activateTab } = seedPane(["a", "b", "c"]);
    act(() => result.current.handleTabDragStart("c", dragEvent()));
    act(() => result.current.handleTabDropOnTab("a", dragEvent(), "left"));
    expect(moveTabWithinPane).toHaveBeenCalledWith(2, 0);
    expect(activateTab).toHaveBeenCalledWith("c");
    expect(result.current.isDraggingTab).toBe(false);
  });

  it("moves a tab right when dropped on a later target", () => {
    const { result } = renderHook(() => useTabDnD());
    const { moveTabWithinPane, activateTab } = seedPane(["a", "b", "c"]);
    act(() => result.current.handleTabDragStart("a", dragEvent()));
    act(() => result.current.handleTabDropOnTab("c", dragEvent(), "right"));
    expect(moveTabWithinPane).toHaveBeenCalledWith(0, 2);
    expect(activateTab).toHaveBeenCalledWith("a");
  });

  it("does not move when dropped on itself", () => {
    const { result } = renderHook(() => useTabDnD());
    const { moveTabWithinPane } = seedPane(["a", "b", "c"]);
    act(() => result.current.handleTabDragStart("a", dragEvent()));
    act(() => result.current.handleTabDropOnTab("a", dragEvent(), "left"));
    expect(moveTabWithinPane).not.toHaveBeenCalled();
  });

  it("does not move when the dragged tab is not in the pane", () => {
    const { result } = renderHook(() => useTabDnD());
    const { moveTabWithinPane } = seedPane(["a", "b", "c"]);
    act(() => result.current.handleTabDragStart("x", dragEvent()));
    act(() => result.current.handleTabDropOnTab("b", dragEvent(), "left"));
    expect(moveTabWithinPane).not.toHaveBeenCalled();
  });

  it("does nothing when there is no active drag", () => {
    const { result } = renderHook(() => useTabDnD());
    const { moveTabWithinPane } = seedPane(["a", "b", "c"]);
    act(() => result.current.handleTabDropOnTab("b", dragEvent(), "left"));
    expect(moveTabWithinPane).not.toHaveBeenCalled();
  });

  it("cross-pane drop moves the tab into the target pane and focuses it (ADR-032)", () => {
    act(() => {
      const s = useTabsStore.getState();
      s.openPinned({ path: "a.md" }); // active leaf gets [a]
      s.splitActivePane("vertical"); // clones a into the new (right) pane
    });

    const leaves = collectLeaves(useTabsStore.getState().root);
    const [left, right] = leaves;
    const cloneId = right.tabGroup.activeTabId as TabId;

    const { result } = renderHook(() => useTabDnD());
    act(() => result.current.handleTabDragStart(cloneId, dragEvent()));
    act(() =>
      result.current.handleTabDropOnTab("tab:a.md", dragEvent(), "left"),
    );

    const after = collectLeaves(useTabsStore.getState().root);
    const afterLeft = after.find((l) => l.id === left.id)!;
    const afterRight = after.find((l) => l.id === right.id)!;
    expect(afterLeft.tabGroup.tabIds).toContain(cloneId);
    expect(afterLeft.tabGroup.activeTabId).toBe(cloneId);
    expect(afterRight.tabGroup.tabIds).not.toContain(cloneId);
    expect(useTabsStore.getState().activePaneId).toBe(left.id);
  });

  it("drop on a pane body appends the tab to that pane (ADR-032)", () => {
    act(() => {
      const s = useTabsStore.getState();
      s.openPinned({ path: "a.md" });
      s.splitActivePane("vertical"); // right pane active, holds clone of a
    });

    const leaves = collectLeaves(useTabsStore.getState().root);
    const right = leaves[1];
    const cloneId = right.tabGroup.activeTabId as TabId;

    const { result } = renderHook(() => useTabDnD());
    // Drag the original `a` (in the LEFT pane) onto the RIGHT pane's body.
    act(() => result.current.handleTabDragStart("tab:a.md", dragEvent()));
    act(() => result.current.handlePaneBodyDrop(right.id, dragEvent()));

    const after = collectLeaves(useTabsStore.getState().root);
    const afterRight = after.find((l) => l.id === right.id)!;
    expect(afterRight.tabGroup.tabIds).toEqual([cloneId, "tab:a.md"]);
    expect(afterRight.tabGroup.activeTabId).toBe("tab:a.md");
    expect(useTabsStore.getState().activePaneId).toBe(right.id);
    expect(useTabsStore.getState().tabs["tab:a.md"]).toMatchObject({
      isPinned: true,
      isPreview: false,
    });
  });

  describe("edge-drop split zones (ADR-032 Phase 7)", () => {
    it("right edge splits into columns with the tab on the right", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      act(() => result.current.handleTabDragStart("tab:a.md", dragEvent()));
      act(() => result.current.handleEdgeDrop("right", paneId, dragEvent()));

      const root = useTabsStore.getState().root;
      expect(root.type).toBe("split");
      if (root.type === "split") {
        expect(root.orientation).toBe("horizontal");
        expect(collectLeaves(root).length).toBe(2);
      }
      const leaves = collectLeaves(root);
      expect(leaves[1].tabGroup.tabIds).toEqual(["tab:a.md"]);
      expect(leaves[1].tabGroup.activeTabId).toBe("tab:a.md");
      expect(useTabsStore.getState().activePaneId).toBe(leaves[1].id);
    });

    it("left edge splits into columns with the tab on the left", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      act(() => result.current.handleTabDragStart("tab:a.md", dragEvent()));
      act(() => result.current.handleEdgeDrop("left", paneId, dragEvent()));

      const root = useTabsStore.getState().root;
      const leaves = collectLeaves(root);
      expect(root.type).toBe("split");
      if (root.type === "split") expect(root.orientation).toBe("horizontal");
      expect(leaves.length).toBe(2);
      expect(leaves[0].tabGroup.tabIds).toEqual(["tab:a.md"]);
      expect(useTabsStore.getState().activePaneId).toBe(leaves[0].id);
    });

    it("top edge splits into rows with the tab above", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      act(() => result.current.handleTabDragStart("tab:a.md", dragEvent()));
      act(() => result.current.handleEdgeDrop("top", paneId, dragEvent()));

      const root = useTabsStore.getState().root;
      const leaves = collectLeaves(root);
      expect(root.type).toBe("split");
      if (root.type === "split") expect(root.orientation).toBe("vertical");
      expect(leaves[0].tabGroup.tabIds).toEqual(["tab:a.md"]);
      expect(useTabsStore.getState().activePaneId).toBe(leaves[0].id);
    });

    it("bottom edge splits into rows with the tab below", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      act(() => result.current.handleTabDragStart("tab:a.md", dragEvent()));
      act(() => result.current.handleEdgeDrop("bottom", paneId, dragEvent()));

      const root = useTabsStore.getState().root;
      const leaves = collectLeaves(root);
      expect(root.type).toBe("split");
      if (root.type === "split") expect(root.orientation).toBe("vertical");
      expect(leaves[1].tabGroup.tabIds).toEqual(["tab:a.md"]);
      expect(useTabsStore.getState().activePaneId).toBe(leaves[1].id);
    });

    it("does nothing when the dropped tab is not in the target pane", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
      });
      const paneId = useTabsStore.getState().activePaneId;

      const { result } = renderHook(() => useTabDnD());
      act(() => result.current.handleTabDragStart("tab:nope.md", dragEvent()));
      const before = useTabsStore.getState().root;
      act(() => result.current.handleEdgeDrop("right", paneId, dragEvent()));
      expect(useTabsStore.getState().root).toEqual(before);
    });
  });

  describe("pointer-event drag (WebKitGTK path, ADR-032)", () => {
    it("dropping on a pill slot reorders within the pane", () => {
      const { result } = renderHook(() => useTabDnD());
      const { moveTabWithinPane, activateTab, paneId } = seedPane([
        "a",
        "b",
        "c",
      ]);
      hookHandlePointerDown(result);
      pointerDown("c", 100, 100);
      pointerMove(106, 106);
      setHit(makeEl({ tabId: "a", tabPaneId: paneId }), {
        left: 50,
        width: 100,
      });
      pointerMove(60, 106); // "a" left slot
      pointerUp(60, 106);
      expect(moveTabWithinPane).toHaveBeenCalledWith(2, 0);
      expect(activateTab).toHaveBeenCalledWith("c");
      expect(result.current.isDraggingTab).toBe(false);
    });

    it("cross-pane drop onto a pill moves the tab into the target pane", () => {
      act(() => {
        const s = useTabsStore.getState();
        s.openPinned({ path: "a.md" });
        s.openPinned({ path: "b.md" });
        s.splitActivePane("vertical"); // right pane = clone of active "b"
      });
      const leaves = collectLeaves(useTabsStore.getState().root);
      const left = leaves.find((l) => l.tabGroup.tabIds.includes("tab:a.md"))!;
      const right = leaves.find((l) => l.id !== left.id)!;
      const rightCloneId = right.tabGroup.activeTabId as TabId;

      const { result } = renderHook(() => useTabDnD());
      hookHandlePointerDown(result);
      pointerDown("tab:a.md", 50, 50);
      pointerMove(60, 60);

      setHit(makeEl({ tabId: rightCloneId, tabPaneId: right.id }), {
        left: 50,
        width: 100,
      });
      pointerMove(60, 60); // the clone's left half in the RIGHT pane
      expect(result.current.dragState?.hoverTarget).toEqual({
        kind: "tab",
        tabId: rightCloneId,
        paneId: right.id,
        edge: "left",
      });
      pointerUp(60, 60);

      const afterRight = collectLeaves(useTabsStore.getState().root).find(
        (l) => l.id === right.id,
      )!;
      expect(afterRight.tabGroup.tabIds).toEqual(["tab:a.md", rightCloneId]);
      expect(useTabsStore.getState().activePaneId).toBe(right.id);
    });
  });
});