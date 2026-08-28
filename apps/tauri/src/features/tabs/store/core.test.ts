import { beforeEach, describe, expect, it, vi } from "vitest";
import { create, type StoreApi, type UseBoundStore } from "zustand";

import { createCoreSlice } from "./core";
import { ROOT_PANE_ID } from "../constants";
import type { TabId, TabModel } from "../types";
import type { TabPane, TabsState } from "./types";

// The core slice imports the runtime `leafRegistry` from @workspace/views.
// For a fast, isolated unit test we stub it; leafTypeForPath falls back to
// "markdown" anyway, so behavior is unchanged.
vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

type TestStore = UseBoundStore<StoreApi<TabsState>>;

// Build a store from the core slice only — no persistence layer, no Tauri IPC.
// `createCoreSlice` is a subset of TabsState (it lacks toWorkspaceSnapshot /
// hydrateFromWorkspaceSnapshot), so we assert the combined shape.
function createTestStore() {
  return create<TabsState>()((set, get, api) =>
    ({
      tabs: {} as Record<TabId, TabModel>,
      pane: {
        id: ROOT_PANE_ID,
        tabIds: [],
        activeTabId: null,
        previewTabId: null,
      } as TabPane,
      persistVersion: 0,
      ...createCoreSlice(set, get, api),
    }) as unknown as TabsState,
  );
}

describe("tabs core slice", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  const open = (path: string, title?: string) => ({ path, title });

  it("openInPreview creates a preview tab, sets it active, returns stable id", () => {
    const id = store.getState().openInPreview(open("notes/a.md", "A"));
    expect(id).toBe("tab:notes/a.md");
    const s = store.getState();
    expect(s.tabs[id]).toMatchObject({
      path: "notes/a.md",
      isPreview: true,
      isPinned: false,
    });
    expect(s.pane.activeTabId).toBe(id);
    expect(s.pane.previewTabId).toBe(id);
    expect(s.pane.tabIds).toEqual([id]);
  });

  it("openInPreview reuses an existing tab for the same path", () => {
    const id1 = store.getState().openInPreview(open("notes/a.md"));
    const id2 = store.getState().openInPreview(open("notes/a.md"));
    expect(id2).toBe(id1);
    expect(store.getState().pane.tabIds.length).toBe(1);
  });

  it("opening a second note evicts a non-dirty preview", () => {
    const a = store.getState().openInPreview(open("notes/a.md"));
    const b = store.getState().openInPreview(open("notes/b.md"));
    const s = store.getState();
    expect(s.pane.tabIds).toEqual([b]);
    expect(s.tabs[a]).toBeUndefined();
    expect(s.pane.previewTabId).toBe(b);
  });

  it("openInPreview with activate:false keeps the current active tab", () => {
    // Pin a so it is not a preview; opening b as a preview must not evict a.
    const a = store.getState().openPinned(open("notes/a.md"));
    const b = store
      .getState()
      .openInPreview(open("notes/b.md"), { activate: false });
    const s = store.getState();
    expect(s.pane.tabIds).toEqual([a, b]);
    expect(s.pane.activeTabId).toBe(a);
    expect(s.pane.previewTabId).toBe(b);
  });

  it("openPinned creates a pinned, non-preview tab", () => {
    const id = store.getState().openPinned(open("notes/p.md"));
    const t = store.getState().tabs[id];
    expect(t?.isPinned).toBe(true);
    expect(t?.isPreview).toBe(false);
  });

  it("activateTab switches active", () => {
    store.getState().openPinned(open("notes/a.md"), { activate: false });
    store.getState().openPinned(open("notes/b.md"), { activate: false });
    store.getState().activateTab("tab:notes/a.md");
    expect(store.getState().pane.activeTabId).toBe("tab:notes/a.md");
  });

  it("closeTab removes the tab and clears pane references", () => {
    const a = store.getState().openPinned(open("notes/a.md"));
    const b = store
      .getState()
      .openPinned(open("notes/b.md"), { activate: false });
    store.getState().closeTab(a);
    const s = store.getState();
    expect(s.tabs[a]).toBeUndefined();
    expect(s.pane.tabIds).toEqual([b]);
    expect(s.pane.activeTabId).toBe(b);
  });

  it("closeTab refuses a dirty tab unless forced", () => {
    const a = store.getState().openInPreview(open("notes/a.md"));
    store.getState().markTabDirty(a, true);
    store.getState().closeTab(a, { force: false });
    expect(store.getState().tabs[a]).toBeDefined();
    store.getState().closeTab(a, { force: true });
    expect(store.getState().tabs[a]).toBeUndefined();
  });

  it("closeOtherTabs keeps only the target", () => {
    const a = store
      .getState()
      .openPinned(open("a.md"), { activate: false });
    const b = store
      .getState()
      .openPinned(open("b.md"), { activate: false });
    const c = store
      .getState()
      .openPinned(open("c.md"), { activate: false });
    store.getState().closeOtherTabs(c);
    const s = store.getState();
    expect(s.pane.tabIds).toEqual([c]);
    expect(s.tabs[c]).toBeDefined();
    expect(s.tabs[a]).toBeUndefined();
    expect(s.tabs[b]).toBeUndefined();
  });

  it("closeTabsToRight drops only trailing tabs", () => {
    const a = store
      .getState()
      .openPinned(open("a.md"), { activate: false });
    const b = store
      .getState()
      .openPinned(open("b.md"), { activate: false });
    store.getState().openPinned(open("c.md"), { activate: false });
    store.getState().closeTabsToRight(b);
    const s = store.getState();
    expect(s.pane.tabIds).toEqual([a, b]);
    expect(s.tabs[a]).toBeDefined();
    expect(s.tabs[b]).toBeDefined();
  });

  it("pin / unpin / togglePin", () => {
    const a = store.getState().openInPreview(open("a.md"));
    store.getState().pinTab(a);
    expect(store.getState().tabs[a]?.isPinned).toBe(true);
    expect(store.getState().tabs[a]?.isPreview).toBe(false);
    store.getState().unpinTab(a);
    expect(store.getState().tabs[a]?.isPinned).toBe(false);
    store.getState().togglePinTab(a);
    expect(store.getState().tabs[a]?.isPinned).toBe(true);
  });

  it("moveTabWithinPane reorders", () => {
    const a = store
      .getState()
      .openPinned(open("a.md"), { activate: false });
    const b = store
      .getState()
      .openPinned(open("b.md"), { activate: false });
    const c = store
      .getState()
      .openPinned(open("c.md"), { activate: false });
    store.getState().moveTabWithinPane(0, 2);
    expect(store.getState().pane.tabIds).toEqual([b, c, a]);
  });

  it("moveTabWithinPane ignores out-of-range and no-op moves", () => {
    store.getState().openPinned(open("a.md"), { activate: false });
    store.getState().openPinned(open("b.md"), { activate: false });
    const before = store.getState().pane.tabIds;
    store.getState().moveTabWithinPane(0, 99);
    expect(store.getState().pane.tabIds).toEqual(before);
    store.getState().moveTabWithinPane(0, 0);
    expect(store.getState().pane.tabIds).toEqual(before);
  });

  it("updateTabPaths repoints path + title, preserves id and dirty state", () => {
    const a = store.getState().openInPreview(open("old/a.md", "A"));
    store.getState().markTabDirty(a, true);
    store.getState().updateTabPaths([{ from: "old/a.md", to: "new/a.md" }]);
    // The tab keeps its path-derived id; only path + title are repointed.
    const t = store.getState().tabs[a];
    expect(t).toBeDefined();
    expect(t?.path).toBe("new/a.md");
    expect(t?.title).toBe("a");
    expect(t?.isDirty).toBe(true);
  });

  it("setTabTitle updates title and bumps persistVersion", () => {
    const a = store.getState().openInPreview(open("a.md", "A"));
    const v0 = store.getState().persistVersion;
    store.getState().setTabTitle(a, "Renamed");
    expect(store.getState().tabs[a]?.title).toBe("Renamed");
    expect(store.getState().persistVersion).toBe(v0 + 1);
  });

  it("reset returns to initial state", () => {
    store.getState().openInPreview(open("a.md"));
    store.getState().reset();
    expect(store.getState().pane.tabIds).toEqual([]);
    expect(Object.keys(store.getState().tabs)).toEqual([]);
    expect(store.getState().persistVersion).toBe(0);
  });
});
