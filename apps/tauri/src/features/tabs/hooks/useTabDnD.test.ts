import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEvent as ReactDragEvent } from "react";

import { useTabsStore } from "../store";
import { createLeaf, collectLeaves } from "../lib/layoutTree";
import { useTabDnD, resetTabDnDStateForTests } from "./useTabDnD";
import type { TabId } from "../types";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

function dragEvent(): ReactDragEvent<HTMLElement> {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: vi.fn(),
      getData: () => "",
      effectAllowed: "",
      dropEffect: "",
    },
  } as unknown as ReactDragEvent<HTMLElement>;
}

function seedPane(tabIds: string[]) {
  const moveTabWithinPane = vi.fn();
  const activateTab = vi.fn();
  act(() => {
    const leaf = createLeaf(tabIds);
    useTabsStore.setState({
      tabs: {},
      root: leaf,
      activePaneId: leaf.id,
      moveTabWithinPane,
      activateTab,
    });
  });
  return { moveTabWithinPane, activateTab };
}

describe("useTabDnD", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
  });

  it("sets isDraggingTab on drag start and clears it on drag end", () => {
    const { result } = renderHook(() => useTabDnD());
    seedPane(["a"]);
    act(() => result.current.handleTabDragStart("a", dragEvent()));
    expect(result.current.isDraggingTab).toBe(true);
    act(() => result.current.handleTabDragEnd(dragEvent()));
    expect(result.current.isDraggingTab).toBe(false);
  });

  it("prevents default and sets dropEffect on drag over", () => {
    const { result } = renderHook(() => useTabDnD());
    const e = dragEvent();
    act(() => result.current.handleTabDragOver(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("move");
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
});
