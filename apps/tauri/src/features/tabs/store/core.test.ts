import { create, type StoreApi, type UseBoundStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TabId, TabModel } from "../types";
import type { TabsState, TabPane } from "./types";

import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import { ROOT_PANE_ID } from "../constants";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

type TestStore = UseBoundStore<StoreApi<TabsState>>;

function createTestStore(): TestStore {
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
      ...createPersistenceSlice(set, get, api),
    }) as unknown as TabsState,
  );
}

describe("tabs core slice", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  describe("openInPreview", () => {
    it("creates a preview tab with the path-derived id and correct shape", () => {
      const id = store.getState().openInPreview({ path: "docs/intro.md" });
      expect(id).toBe("tab:docs/intro.md");
      const tab = store.getState().tabs[id];
      expect(tab).toMatchObject({
        id,
        path: "docs/intro.md",
        title: "intro",
        leafType: "markdown",
        isPinned: false,
        isPreview: true,
        isDirty: false,
      });
      expect(store.getState().pane.previewTabId).toBe(id);
      expect(store.getState().pane.activeTabId).toBe(id);
    });

    it("uses an explicit title when provided", () => {
      const id = store.getState().openInPreview({ path: "docs/intro.md", title: "Introduction" });
      expect(store.getState().tabs[id].title).toBe("Introduction");
    });

    it("carries the transient renameOnOpen flag set by note creation", () => {
      const id = store.getState().openPinned({
        path: "dir/new.md",
        renameOnOpen: true,
      });
      expect(store.getState().tabs[id].renameOnOpen).toBe(true);
    });

    it("re-applies renameOnOpen when an existing tab is reopened with the flag", () => {
      const id = store.getState().openPinned({ path: "new.md" });
      expect(store.getState().tabs[id].renameOnOpen).toBeUndefined();
      store.getState().openPinned({ path: "new.md", renameOnOpen: true });
      expect(store.getState().tabs[id].renameOnOpen).toBe(true);
    });

    it("replaces a non-dirty preview tab instead of duplicating", () => {
      store.getState().openInPreview({ path: "a.md" });
      store.getState().openInPreview({ path: "b.md" });
      expect(Object.keys(store.getState().tabs)).toHaveLength(1);
      expect(Object.values(store.getState().tabs)[0].path).toBe("b.md");
    });

    it("promotes a dirty preview tab to pinned rather than discarding it", () => {
      const id1 = store.getState().openInPreview({ path: "a.md" });
      store.getState().markTabDirty(id1, true);
      store.getState().openInPreview({ path: "b.md" });
      const ids = Object.keys(store.getState().tabs);
      expect(ids).toHaveLength(2);
      expect(store.getState().tabs[id1].isPinned).toBe(true);
      expect(store.getState().tabs[id1].isPreview).toBe(false);
      const preview = Object.values(store.getState().tabs).find((t) => t.isPreview);
      expect(preview?.path).toBe("b.md");
    });

    it("is idempotent for an already-open path (no duplicate tab)", () => {
      const id1 = store.getState().openInPreview({ path: "a.md" });
      const id2 = store.getState().openInPreview({ path: "a.md" });
      expect(id2).toBe(id1);
      expect(Object.keys(store.getState().tabs)).toHaveLength(1);
    });

    it("re-finds a moved tab by path and keeps its original id (stranding guard)", () => {
      const id1 = store.getState().openInPreview({ path: "docs/old.md" });
      store.getState().updateTabPaths([{ from: "docs/old.md", to: "docs/new.md" }]);
      expect(store.getState().tabs[id1].path).toBe("docs/new.md");

      // Opening the note at its new path must resolve to the SAME tab id,
      // not create a second `tab:docs/new.md`.
      const id2 = store.getState().openInPreview({ path: "docs/new.md" });
      expect(id2).toBe(id1);
      expect(Object.keys(store.getState().tabs)).toHaveLength(1);
    });

    it("does not change activeTabId when activate is false", () => {
      const id = store.getState().openInPreview({ path: "a.md" }, { activate: false });
      expect(store.getState().pane.activeTabId).toBe(null);
      expect(store.getState().pane.previewTabId).toBe(id);
    });
  });

  describe("openPinned", () => {
    it("creates a pinned, non-preview tab", () => {
      const id = store.getState().openPinned({ path: "a.md" });
      const tab = store.getState().tabs[id];
      expect(tab.isPinned).toBe(true);
      expect(tab.isPreview).toBe(false);
      expect(store.getState().pane.activeTabId).toBe(id);
      expect(store.getState().pane.previewTabId).toBe(null);
    });

    it("promotes an existing tab to pinned instead of duplicating", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().openPinned({ path: "a.md" });
      expect(store.getState().tabs[id].isPinned).toBe(true);
      expect(store.getState().tabs[id].isPreview).toBe(false);
      expect(Object.keys(store.getState().tabs)).toHaveLength(1);
    });
  });

  describe("activateTab", () => {
    it("no-ops for an unknown id", () => {
      store.getState().activateTab("nope");
      expect(store.getState().pane.activeTabId).toBe(null);
    });

    it("sets activeTabId for an open tab", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      expect(store.getState().pane.activeTabId).toBe(id);
    });

    it("no-ops when the tab is already active", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().activateTab(id);
      expect(store.getState().pane.activeTabId).toBe(id);
    });

    it("no-ops for a tab no longer in the pane", () => {
      const a = store.getState().openPinned({ path: "a.md" });
      const b = store.getState().openPinned({ path: "b.md" });
      store.getState().closeTab(a);
      store.getState().activateTab(a);
      expect(store.getState().pane.activeTabId).toBe(b);
    });
  });

  describe("closeTab", () => {
    it("preserves a dirty tab when force is false", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().markTabDirty(id, true);
      store.getState().closeTab(id, { force: false });
      expect(store.getState().tabs[id]).toBeDefined();
    });

    it("closes a dirty tab when force is true (the default)", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().markTabDirty(id, true);
      store.getState().closeTab(id);
      expect(store.getState().tabs[id]).toBeUndefined();
    });

    it("repoints activeTabId to the remaining tab after close", () => {
      const a = store.getState().openPinned({ path: "a.md" });
      const b = store.getState().openInPreview({ path: "b.md" });
      store.getState().activateTab(b);
      store.getState().closeTab(b);
      expect(store.getState().tabs[b]).toBeUndefined();
      expect(store.getState().pane.activeTabId).toBe(a);
    });
  });

  describe("closeOtherTabs", () => {
    it("keeps only the target tab and activates it", () => {
      store.getState().openPinned({ path: "a.md" });
      const b = store.getState().openPinned({ path: "b.md" });
      store.getState().openPinned({ path: "c.md" });
      store.getState().closeOtherTabs(b);
      expect(Object.keys(store.getState().tabs)).toEqual([b]);
      expect(store.getState().pane.activeTabId).toBe(b);
    });
  });

  describe("closeTabsToRight", () => {
    it("closes every tab after the target index", () => {
      const a = store.getState().openPinned({ path: "a.md" });
      store.getState().openPinned({ path: "b.md" });
      store.getState().openPinned({ path: "c.md" });
      store.getState().closeTabsToRight(a);
      expect(Object.keys(store.getState().tabs)).toEqual([a]);
      expect(store.getState().pane.activeTabId).toBe(a);
    });
  });

  describe("markTabDirty", () => {
    it("flips dirty state", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().markTabDirty(id, true);
      expect(store.getState().tabs[id].isDirty).toBe(true);
      store.getState().markTabDirty(id, false);
      expect(store.getState().tabs[id].isDirty).toBe(false);
    });
  });

  describe("setTabTitle", () => {
    it("updates the title and bumps persistVersion", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      const v0 = store.getState().persistVersion;
      store.getState().setTabTitle(id, "Renamed");
      expect(store.getState().tabs[id].title).toBe("Renamed");
      expect(store.getState().persistVersion).toBe(v0 + 1);
    });

    it("is a no-op when the title is unchanged", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().setTabTitle(id, "a");
      const v1 = store.getState().persistVersion;
      store.getState().setTabTitle(id, "a");
      expect(store.getState().persistVersion).toBe(v1);
    });
  });

  describe("pin / unpin / togglePinTab", () => {
    it("pins, unpins, and toggles", () => {
      const id = store.getState().openInPreview({ path: "a.md" });
      store.getState().pinTab(id);
      expect(store.getState().tabs[id].isPinned).toBe(true);
      expect(store.getState().tabs[id].isPreview).toBe(false);
      expect(store.getState().pane.previewTabId).toBe(null);
      store.getState().unpinTab(id);
      expect(store.getState().tabs[id].isPinned).toBe(false);
      store.getState().togglePinTab(id);
      expect(store.getState().tabs[id].isPinned).toBe(true);
      store.getState().togglePinTab(id);
      expect(store.getState().tabs[id].isPinned).toBe(false);
    });
  });

  describe("moveTabWithinPane", () => {
    it("reorders tabIds and ignores invalid / no-op moves", () => {
      const a = store.getState().openPinned({ path: "a.md" });
      const b = store.getState().openPinned({ path: "b.md" });
      const c = store.getState().openPinned({ path: "c.md" });
      store.getState().moveTabWithinPane(0, 2);
      expect(store.getState().pane.tabIds).toEqual([b, c, a]);
      store.getState().moveTabWithinPane(0, 0);
      expect(store.getState().pane.tabIds).toEqual([b, c, a]);
      store.getState().moveTabWithinPane(-1, 1);
      expect(store.getState().pane.tabIds).toEqual([b, c, a]);
      store.getState().moveTabWithinPane(0, 99);
      expect(store.getState().pane.tabIds).toEqual([b, c, a]);
    });
  });

  describe("updateTabPaths", () => {
    it("repoints path + title while preserving the tab id and bumps version", () => {
      const id = store.getState().openInPreview({ path: "docs/old.md" });
      const v0 = store.getState().persistVersion;
      store.getState().updateTabPaths([{ from: "docs/old.md", to: "docs/new.md" }]);
      expect(store.getState().tabs[id].path).toBe("docs/new.md");
      expect(store.getState().tabs[id].title).toBe("new");
      expect(store.getState().tabs[id].id).toBe(id);
      expect(store.getState().persistVersion).toBe(v0 + 1);
    });

    it("is a no-op (no version bump) when nothing matches", () => {
      store.getState().openInPreview({ path: "docs/old.md" });
      const v1 = store.getState().persistVersion;
      store.getState().updateTabPaths([{ from: "nope.md", to: "x.md" }]);
      expect(store.getState().persistVersion).toBe(v1);
    });
  });

  describe("reset", () => {
    it("returns to the empty initial state", () => {
      store.getState().openPinned({ path: "a.md" });
      store.getState().reset();
      expect(Object.keys(store.getState().tabs)).toHaveLength(0);
      expect(store.getState().pane.tabIds).toEqual([]);
      store.getState().moveTabWithinPane(0, 99);
      expect(store.getState().pane.previewTabId).toBe(null);
    });
  });
});
