import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SerializedTab, TabsWorkspaceSnapshotV2 } from "../../types";
import { collectLeaves } from "../../lib/layoutTree";
import { createTestStore, type TestStore } from "./testUtils";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

describe("persistenceSync slice", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  it("hydration prunes tabs not referenced by any pane (graph-open regression)", () => {
    // A V2 snapshot whose `tabs` map has MORE tabs than the tree references —
    // the exact corrupt state that stranded "view://graph" in the wild: tabs
    // exist in `tabs` but belong to no leaf's tabGroup, so openView finds them
    // and activateTab silently no-ops → "nothing appears".
    const note: SerializedTab = {
      id: "tab:a.md",
      path: "a.md",
      title: "a",
      leafType: "markdown",
      viewMode: "edit",
      isPinned: true,
      isPreview: false,
      isDirty: false,
      createdAt: 0,
      lastAccessedAt: 0,
    };
    const orphanGraph: SerializedTab = {
      id: "tab:view://graph",
      path: "view://graph",
      title: "Graph",
      leafType: "graph",
      viewMode: "edit",
      isPinned: true,
      isPreview: false,
      isDirty: false,
      createdAt: 0,
      lastAccessedAt: 0,
    };
    const snap: TabsWorkspaceSnapshotV2 = {
      version: 2,
      activePaneId: "pane-1",
      root: {
        id: "pane-1",
        type: "leaf",
        tabGroup: {
          id: "group-1",
          tabIds: [note.id],
          activeTabId: note.id,
          previewTabId: null,
        },
      },
      tabs: [note, orphanGraph],
    };

    store.getState().reset();
    store.getState().hydrateFromWorkspaceSnapshot(snap);

    expect(store.getState().tabs).toHaveProperty("tab:a.md");
    expect(store.getState().tabs).not.toHaveProperty("tab:view://graph");
  });

  it("v2 round-trip preserves split layout", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().splitActivePane("vertical");
    store.getState().openPinned({ path: "b.md" });

    const snap = store.getState().toWorkspaceSnapshot();
    expect(snap.version).toBe(2);
    if (snap.version === 2) {
      expect(snap.root.type).toBe("split");
    }

    store.getState().reset();
    store.getState().hydrateFromWorkspaceSnapshot(snap);

    const root = store.getState().root;
    expect(root.type).toBe("split");
    const leaves = collectLeaves(root);
    expect(leaves).toHaveLength(2);
  });

  it("split sizes survive the v2 persistence round-trip", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().splitActivePane("vertical");
    const firstRoot = store.getState().root;
    if (firstRoot.type !== "split") throw new Error("expected split");
    store.getState().resizeSplit(firstRoot.id, [0.7, 0.3]);

    const snap = store.getState().toWorkspaceSnapshot();
    store.getState().reset();
    store.getState().hydrateFromWorkspaceSnapshot(snap);

    const root = store.getState().root;
    expect(root.type).toBe("split");
    if (root.type === "split") {
      expect(root.children[0].size).toBeCloseTo(0.7, 5);
      expect(root.children[1].size).toBeCloseTo(0.3, 5);
    }
  });
});