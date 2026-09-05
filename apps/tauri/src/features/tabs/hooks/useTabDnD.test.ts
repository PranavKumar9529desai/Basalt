import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEvent as ReactDragEvent } from "react";

import { useTabsStore } from "../store";
import { createLeaf } from "../lib/layoutTree";
import { useTabDnD } from "./useTabDnD";

function dragEvent(): ReactDragEvent<HTMLElement> {
  return {
    preventDefault: vi.fn(),
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
  });

  it("sets isDraggingTab on drag start and clears it on drag end", () => {
    const { result } = renderHook(() => useTabDnD());
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
});
