import { create, type StoreApi, type UseBoundStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import { ROOT_PANE_ID } from "../constants";
import type { TabId, TabModel } from "../types";
import type { TabsState, TabPane } from "./types";

type TestStore = UseBoundStore<StoreApi<TabsState>>;

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

function createTestStore(): TestStore {
  return create<TabsState>()(
    (set, get, api) =>
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
        ...createPersistenceSlice(set, get, api),
      }) as unknown as TabsState,
  );
}

describe("tabs persistence", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  it("serializes open tabs + pane into a v1 snapshot", () => {
    const a = store
      .getState()
      .openPinned({ path: "a.md" }, { activate: false });
    const b = store
      .getState()
      .openPinned({ path: "b.md" }, { activate: false });
    store.getState().activateTab(a);
    const snap = store.getState().toWorkspaceSnapshot();
    expect(snap.version).toBe(1);
    expect(snap.tabs).toHaveLength(2);
    expect(snap.panes).toHaveLength(1);
    expect(snap.panes?.[0].tabIds).toEqual([a, b]);
    expect(snap.panes?.[0].activeTabId).toBe(a);
  });

  it("never serializes transient fields (line, renameOnOpen)", () => {
    store.getState().openPinned({ path: "a.md", line: 12, renameOnOpen: true });
    const snap = store.getState().toWorkspaceSnapshot();
    const serialized = snap.tabs[0];
    expect(serialized).not.toHaveProperty("line");
    expect(serialized).not.toHaveProperty("renameOnOpen");
    // leafType IS persisted (graph tabs must survive restart).
    expect(serialized).toHaveProperty("leafType", "markdown");
  });

  it("round-trips: snapshot -> reset -> hydrate restores state", () => {
    const a = store
      .getState()
      .openPinned({ path: "a.md" }, { activate: false });
    const b = store
      .getState()
      .openPinned({ path: "b.md" }, { activate: false });
    // open-order is [a, b]; make a active, then hydrate.
    store.getState().activateTab(a);
    store.getState().markTabDirty(a, true);

    const snap = store.getState().toWorkspaceSnapshot();

    store.getState().reset();
    expect(store.getState().pane.tabIds).toEqual([]);

    store.getState().hydrateFromWorkspaceSnapshot(snap);
    const s = store.getState();
    expect(s.pane.tabIds).toEqual([a, b]);
    expect(s.pane.activeTabId).toBe(a);
    expect(s.tabs[a]?.isDirty).toBe(true);
    expect(s.tabs[a]?.path).toBe("a.md");
  });

  it("ignores snapshots with an unknown version (no-op hydrate)", () => {
    const a = store.getState().openPinned({ path: "a.md" });
    const before = store.getState().pane.tabIds;
    store
      .getState()
      .hydrateFromWorkspaceSnapshot({ version: 2, tabs: [] } as never);
    expect(store.getState().pane.tabIds).toEqual(before);
    expect(store.getState().tabs[a]).toBeDefined();
  });

  it("accepts legacy `groups` format as `panes`", () => {
    const snapshot = {
      version: 1,
      groups: [
        {
          id: ROOT_PANE_ID,
          tabIds: ["tab:x.md"],
          activeTabId: "tab:x.md",
          previewTabId: null,
        },
      ],
      tabs: [
        {
          id: "tab:x.md",
          path: "x.md",
          title: "x",
          isPinned: false,
          isPreview: false,
          isDirty: false,
          createdAt: 0,
          lastAccessedAt: 0,
        },
      ],
    } as never;
    store.getState().hydrateFromWorkspaceSnapshot(snapshot);
    expect(store.getState().pane.tabIds).toEqual(["tab:x.md"]);
    expect(store.getState().pane.activeTabId).toBe("tab:x.md");
  });

  it("maps legacy `viewType` to `leafType`, defaulting to markdown", () => {
    const snapshot = {
      version: 1,
      panes: [
        {
          id: ROOT_PANE_ID,
          tabIds: ["tab:x.md"],
          activeTabId: "tab:x.md",
          previewTabId: null,
        },
      ],
      tabs: [
        {
          id: "tab:x.md",
          path: "x.md",
          title: "x",
          isPinned: false,
          isPreview: false,
          isDirty: false,
          createdAt: 0,
          lastAccessedAt: 0,
          viewType: "canvas",
        },
      ],
    } as never;
    store.getState().hydrateFromWorkspaceSnapshot(snapshot);
    expect(store.getState().tabs["tab:x.md"]?.leafType).toBe("canvas");
  });

  it("keeps leafType when present on a current-format tab", () => {
    const snapshot = {
      version: 1,
      panes: [
        {
          id: ROOT_PANE_ID,
          tabIds: ["tab:x.md"],
          activeTabId: "tab:x.md",
          previewTabId: null,
        },
      ],
      tabs: [
        {
          id: "tab:x.md",
          path: "x.md",
          title: "x",
          isPinned: false,
          isPreview: false,
          isDirty: false,
          createdAt: 0,
          lastAccessedAt: 0,
          leafType: "markdown",
        },
      ],
    } as never;
    store.getState().hydrateFromWorkspaceSnapshot(snapshot);
    expect(store.getState().tabs["tab:x.md"]?.leafType).toBe("markdown");
  });

  it("drops pane.tabIds that reference missing tabs and restores to a surviving tab", () => {
    const snapshot = {
      version: 1,
      panes: [
        {
          id: ROOT_PANE_ID,
          tabIds: ["tab:real.md", "tab:ghost.md"],
          activeTabId: "tab:ghost.md",
          previewTabId: null,
        },
      ],
      tabs: [
        {
          id: "tab:real.md",
          path: "real.md",
          title: "real",
          isPinned: false,
          isPreview: false,
          isDirty: false,
          createdAt: 0,
          lastAccessedAt: 0,
        },
      ],
    } as never;
    store.getState().hydrateFromWorkspaceSnapshot(snapshot);
    const s = store.getState();
    expect(s.pane.tabIds).toEqual(["tab:real.md"]);
    expect(s.pane.activeTabId).toBe("tab:real.md");
  });
});
