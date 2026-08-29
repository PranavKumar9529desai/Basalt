import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TabId, TabModel, TabPane } from "../types";

import { useTabsStore } from "../store";
import { useTabs } from "./useTabs";

function tab(id: string, path: string, over: Partial<TabModel> = {}): TabModel {
  return {
    id,
    path,
    title: path,
    leafType: "markdown",
    isPinned: false,
    isPreview: false,
    isDirty: false,
    createdAt: 1,
    lastAccessedAt: 1,
    ...over,
  };
}

function pane(tabIds: TabId[], activeTabId: TabId | null, over: Partial<TabPane> = {}): TabPane {
  return { id: "p1", tabIds, activeTabId, previewTabId: null, ...over };
}

describe("useTabs", () => {
  beforeEach(() => {
    act(() => useTabsStore.getState().reset());
  });

  it("resolves activeTab from pane.activeTabId", () => {
    const a = tab("a.md", "a.md");
    act(() =>
      useTabsStore.setState({ tabs: { "a.md": a }, pane: pane(["a.md"], "a.md") }),
    );
    const { result } = renderHook(() => useTabs());
    expect(result.current.activeTab).toBe(a);
  });

  it("returns null when there is no active tab", () => {
    act(() =>
      useTabsStore.setState({
        tabs: { "a.md": tab("a.md", "a.md") },
        pane: pane(["a.md"], null),
      }),
    );
    const { result } = renderHook(() => useTabs());
    expect(result.current.activeTab).toBe(null);
  });

  it("returns null when activeTabId points to a missing tab", () => {
    act(() =>
      useTabsStore.setState({
        tabs: { "a.md": tab("a.md", "a.md") },
        pane: pane(["a.md"], "ghost.md"),
      }),
    );
    const { result } = renderHook(() => useTabs());
    expect(result.current.activeTab).toBe(null);
  });

  it("exposes the store tab actions", () => {
    const { result } = renderHook(() => useTabs());
    expect(typeof result.current.openInPreview).toBe("function");
    expect(typeof result.current.moveTabWithinPane).toBe("function");
    expect(typeof result.current.closeTab).toBe("function");
  });
});
