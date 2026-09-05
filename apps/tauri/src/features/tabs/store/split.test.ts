import { create, type StoreApi, type UseBoundStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import { ROOT_PANE_ID } from "../constants";
import type { TabId, TabModel, LayoutNode } from "../types";
import type { TabsState, TabPane } from "./types";
import { createLeaf, collectLeaves } from "../lib/layoutTree";

type TestStore = UseBoundStore<StoreApi<TabsState>>;

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

function createTestStore(): TestStore {
  const initialLeaf = createLeaf();
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
        root: initialLeaf as LayoutNode,
        activePaneId: initialLeaf.id,
        persistVersion: 0,
        ...createCoreSlice(set, get, api),
        ...createPersistenceSlice(set, get, api),
      }) as unknown as TabsState,
  );
}

describe("split pane actions", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
  });

  it("splitActivePane creates two leaves in a split node", () => {
    const before = store.getState().root;
    expect(before.type).toBe("leaf");

    store.getState().splitActivePane("vertical");

    const after = store.getState().root;
    expect(after.type).toBe("split");
    if (after.type === "split") {
      expect(after.orientation).toBe("vertical");
      expect(after.children).toHaveLength(2);
      expect(after.children[0].type).toBe("leaf");
      expect(after.children[1].type).toBe("leaf");
    }
  });

  it("splitActivePane activates the new leaf", () => {
    const beforeId = store.getState().activePaneId;
    store.getState().splitActivePane("horizontal");
    const afterId = store.getState().activePaneId;
    expect(afterId).not.toBe(beforeId);
  });

  it("closePane removes a leaf and unwraps single-child split", () => {
    store.getState().splitActivePane("vertical");
    const root = store.getState().root;
    expect(root.type).toBe("split");

    // Get the second leaf's id
    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);
    const secondLeafId = leaves[1].id;

    store.getState().closePane(secondLeafId);

    const after = store.getState().root;
    // Should unwrap back to a single leaf
    expect(after.type).toBe("leaf");
  });

  it("closePane is no-op when only one pane remains", () => {
    const before = store.getState().root;
    const leafId = store.getState().activePaneId;
    store.getState().closePane(leafId);
    const after = store.getState().root;
    expect(after).toBe(before); // same reference = no-op
  });

  it("activatePane changes active pane", () => {
    store.getState().splitActivePane("vertical");
    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);

    store.getState().activatePane(leaves[0].id);
    expect(store.getState().activePaneId).toBe(leaves[0].id);

    store.getState().activatePane(leaves[1].id);
    expect(store.getState().activePaneId).toBe(leaves[1].id);
  });

  it("activatePane is no-op for same pane", () => {
    const before = store.getState().activePaneId;
    store.getState().activatePane(before);
    expect(store.getState().activePaneId).toBe(before);
  });

  it("deep splits: split twice creates nested tree", () => {
    store.getState().splitActivePane("vertical");
    const leaves1 = collectLeaves(store.getState().root);
    expect(leaves1).toHaveLength(2);

    // Split the new (active) leaf again
    store.getState().splitActivePane("horizontal");
    const leaves2 = collectLeaves(store.getState().root);
    expect(leaves2).toHaveLength(3);

    const root = store.getState().root;
    expect(root.type).toBe("split");
    if (root.type === "split") {
      expect(root.orientation).toBe("vertical");
      // First child is still a leaf, second child is a horizontal split
      expect(root.children[0].type).toBe("leaf");
      expect(root.children[1].type).toBe("split");
    }
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
});
