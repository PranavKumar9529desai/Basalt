import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

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
  let leafId = "";
  act(() => {
    const leaf = createLeaf(tabIds);
    leafId = leaf.id;
    useTabsStore.setState({
      tabs: {},
      root: leaf,
      activePaneId: leaf.id,
      moveTabWithinPane,
      activateTab,
    });
  });
  return { moveTabWithinPane, activateTab, paneId: leafId };
}

// --- Pointer-drag helpers (the WebKitGTK path uses real window listeners and
// DOM hit-testing, so tests drive those directly). ---

const pointerEvent = (
  type: string,
  x: number,
  y: number,
  opts: Partial<MouseEventInit> = {},
) => new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...opts });

function pointerDown(tabId: string, x: number, y: number) {
  act(() => {
    handlers_handlePointerDown(tabId, x, y);
  });
}

// jsdom has no elementFromPoint; stub it per-call via a mutable cell.
let hitTarget: HTMLElement | null = null;
function setHit(
  el: HTMLElement | null,
  rect?: { left?: number; top?: number; width?: number; height?: number },
) {
  hitTarget = el;
  if (el && rect) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 24, ...rect }) as DOMRect;
  }
}

function stubElementFromPoint() {
  (
    document as unknown as { elementFromPoint: () => HTMLElement | null }
  ).elementFromPoint = () => hitTarget;
}

function makeEl(attrs: Record<string, string>) {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) {
    const dataKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
    el.setAttribute(`data-${dataKey}`, v);
  }
  return el;
}

type PointerDownFn = (tabId: string, x: number, y: number) => void;
let handlers_handlePointerDown: PointerDownFn = () => undefined;

function hookHandlePointerDown(result: {
  current: ReturnType<typeof useTabDnD>;
}) {
  handlers_handlePointerDown = (tabId, x, y) =>
    result.current.handleTabPointerDown(tabId, {
      button: 0,
      clientX: x,
      clientY: y,
    } as unknown as ReactPointerEvent<HTMLElement>);
}

function pointerMove(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointermove", x, y)));
}

function pointerUp(x: number, y: number) {
  act(() => window.dispatchEvent(pointerEvent("pointerup", x, y)));
}

describe("useTabDnD", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
    resetTabDnDStateForTests();
    hitTarget = null;
    stubElementFromPoint();
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
