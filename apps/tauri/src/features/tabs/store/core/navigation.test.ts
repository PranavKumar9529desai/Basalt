import { create, type StoreApi, type UseBoundStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId, TabModel } from "../../types";
import type { TabsState } from "../types";

import { createCoreSlice } from "../core";
import { createPersistenceSlice } from "../persistence";
import { createLeaf } from "../../lib/layoutTree";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

type TestStore = UseBoundStore<StoreApi<TabsState>>;

function createTestStore(): TestStore {
  const initialLeaf = createLeaf();
  return create<TabsState>()(
    (set, get, api) =>
      ({
        tabs: {} as Record<TabId, TabModel>,
        root: initialLeaf,
        activePaneId: initialLeaf.id,
        persistVersion: 0,
        ...createCoreSlice(set, get, api),
        ...createPersistenceSlice(set, get, api),
      }) as unknown as TabsState,
  );
}

describe("tabs navigation slice", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  it("initializes a single history entry on openPinned", () => {
    const id = store
      .getState()
      .openPinned({ path: "notes/A.md", title: "Note A" });
    const tab = store.getState().tabs[id];
    expect(tab.history).toHaveLength(1);
    expect(tab.historyIndex).toBe(0);
    expect(tab.history?.[0].path).toBe("notes/A.md");
    expect(tab.history?.[0].title).toBe("Note A");
  });

  it("inherits and appends history across preview tab navigation", () => {
    const id1 = store
      .getState()
      .openInPreview({ path: "notes/A.md", title: "Note A" });
    expect(store.getState().tabs[id1].history).toHaveLength(1);

    const id2 = store
      .getState()
      .openInPreview({ path: "notes/B.md", title: "Note B" });
    const tab2 = store.getState().tabs[id2];
    expect(tab2.history).toHaveLength(2);
    expect(tab2.historyIndex).toBe(1);
    expect(tab2.history?.[0].path).toBe("notes/A.md");
    expect(tab2.history?.[1].path).toBe("notes/B.md");
  });

  it("navigates back and forward through tab history", () => {
    store.getState().openInPreview({ path: "notes/A.md", title: "Note A" });
    const activeTabId = store
      .getState()
      .openInPreview({ path: "notes/B.md", title: "Note B" });

    // Navigate Back
    store.getState().navigateBack(activeTabId);
    let tab = store.getState().tabs[activeTabId];
    expect(tab.path).toBe("notes/A.md");
    expect(tab.title).toBe("Note A");
    expect(tab.historyIndex).toBe(0);

    // Navigating back when at beginning is a no-op
    store.getState().navigateBack(activeTabId);
    tab = store.getState().tabs[activeTabId];
    expect(tab.historyIndex).toBe(0);

    // Navigate Forward
    store.getState().navigateForward(activeTabId);
    tab = store.getState().tabs[activeTabId];
    expect(tab.path).toBe("notes/B.md");
    expect(tab.title).toBe("Note B");
    expect(tab.historyIndex).toBe(1);

    // Navigating forward when at end is a no-op
    store.getState().navigateForward(activeTabId);
    tab = store.getState().tabs[activeTabId];
    expect(tab.historyIndex).toBe(1);
  });

  it("jumps to a specific history index with navigateToHistoryIndex", () => {
    const tabId = store
      .getState()
      .openPinned({ path: "notes/A.md", title: "Note A" });
    store.getState().pushTabHistory(tabId, {
      path: "notes/B.md",
      title: "Note B",
      leafType: "markdown",
    });
    store.getState().pushTabHistory(tabId, {
      path: "notes/C.md",
      title: "Note C",
      leafType: "markdown",
    });

    expect(store.getState().tabs[tabId].history).toHaveLength(3);
    expect(store.getState().tabs[tabId].historyIndex).toBe(2);

    store.getState().navigateToHistoryIndex(tabId, 0);
    expect(store.getState().tabs[tabId].path).toBe("notes/A.md");
    expect(store.getState().tabs[tabId].historyIndex).toBe(0);

    store.getState().navigateToHistoryIndex(tabId, 1);
    expect(store.getState().tabs[tabId].path).toBe("notes/B.md");
    expect(store.getState().tabs[tabId].historyIndex).toBe(1);
  });

  it("truncates forward history when pushing a new entry from an earlier index", () => {
    const tabId = store
      .getState()
      .openPinned({ path: "notes/A.md", title: "Note A" });
    store.getState().pushTabHistory(tabId, {
      path: "notes/B.md",
      title: "Note B",
      leafType: "markdown",
    });
    store.getState().pushTabHistory(tabId, {
      path: "notes/C.md",
      title: "Note C",
      leafType: "markdown",
    });

    // Go back to A (index 0)
    store.getState().navigateToHistoryIndex(tabId, 0);
    expect(store.getState().tabs[tabId].historyIndex).toBe(0);

    // Push new entry D -> forward entries B and C should be truncated
    store.getState().pushTabHistory(tabId, {
      path: "notes/D.md",
      title: "Note D",
      leafType: "markdown",
    });

    const tab = store.getState().tabs[tabId];
    expect(tab.history).toHaveLength(2);
    expect(tab.history?.map((e) => e.path)).toEqual([
      "notes/A.md",
      "notes/D.md",
    ]);
    expect(tab.historyIndex).toBe(1);
  });
});
