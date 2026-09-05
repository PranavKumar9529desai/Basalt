import { create, type StoreApi, type UseBoundStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoreSlice } from "./core";
import { createPersistenceSlice } from "./persistence";
import type {
  TabId,
  TabModel,
  LayoutNode,
  SerializedTab,
  TabsWorkspaceSnapshotV2,
} from "../types";
import type { TabsState } from "./types";
import {
  createLeaf,
  collectLeaves,
  findLeaf,
  findLeafByTab,
} from "../lib/layoutTree";

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

  it("splitActivePane duplicates the active tab into the new pane (distinct id)", () => {
    const a = store.getState().openPinned({ path: "a.md" });
    store.getState().splitActivePane("vertical");

    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);
    const [left, right] = leaves;

    // Source pane keeps its tab; the new pane shows the SAME note but with a
    // fresh id so each pane has an independent editor controller.
    expect(left.tabGroup.activeTabId).toBe(a);
    const rightTabId = right.tabGroup.activeTabId as TabId;
    expect(rightTabId).not.toBe(a);
    const rightTab = store.getState().tabs[rightTabId];
    expect(rightTab).toMatchObject({
      path: "a.md",
      title: "a",
      isDirty: false,
      isPreview: false,
    });
  });

  it("creates an empty new pane when there is no active tab", () => {
    store.getState().splitActivePane("vertical");
    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);
    expect(leaves[1].tabGroup.tabIds).toEqual([]);
  });

  it("tab activation in one pane does not leak into another pane (Bug 1)", () => {
    const a = store.getState().openPinned({ path: "a.md" });
    const b = store.getState().openPinned({ path: "b.md" });
    store.getState().openPinned({ path: "c.md" });
    const leavesBefore = collectLeaves(store.getState().root);
    store.getState().activateTab(leavesBefore[0].tabGroup.tabIds[2] as TabId);
    store.getState().splitActivePane("vertical");

    const leaves = collectLeaves(store.getState().root);
    const [left, right] = leaves;
    const rightActiveId = right.tabGroup.activeTabId;

    // Click around the LEFT pane's tabs — the right pane's active tab must
    // not follow along.
    store.getState().activatePane(left.id);
    store.getState().activateTab(a);
    store.getState().activateTab(b);

    const after = collectLeaves(store.getState().root);
    expect(after.find((l) => l.id === right.id)?.tabGroup.activeTabId).toBe(
      rightActiveId,
    );
  });

  it("closing the last tab of a pane closes the pane itself", () => {
    const a = store.getState().openPinned({ path: "a.md" });
    store.getState().splitActivePane("vertical");
    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);

    // Left pane holds [a], right pane holds the clone. Close the only tab
    // of the left pane -> the pane itself closes and the tree unwraps.
    store.getState().activatePane(leaves[0].id);
    store.getState().closeTab(a);

    expect(store.getState().root.type).toBe("leaf");
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

  it("moveTabToPane moves a tab into another pane and pins it (ADR-032)", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().openPinned({ path: "b.md" });
    store.getState().splitActivePane("horizontal"); // clones b into new pane
    const leaves = collectLeaves(store.getState().root);
    const [left, right] = leaves;
    const cloneId = right.tabGroup.activeTabId as TabId;

    store.getState().moveTabToPane("tab:a.md", right.id, 0);

    const after = collectLeaves(store.getState().root);
    const afterLeft = after.find((l) => l.id === left.id)!;
    const afterRight = after.find((l) => l.id === right.id)!;
    expect(afterLeft.tabGroup.tabIds).toEqual(["tab:b.md"]);
    expect(afterRight.tabGroup.tabIds).toEqual(["tab:a.md", cloneId]);
    expect(afterRight.tabGroup.activeTabId).toBe("tab:a.md");
    expect(store.getState().activePaneId).toBe(right.id);
    expect(store.getState().tabs["tab:a.md"]).toMatchObject({
      isPinned: true,
      isPreview: false,
    });
  });

  it("moveTabToPane is a no-op within the same pane", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().openPinned({ path: "b.md" });
    const before = store.getState().root;
    const paneId = store.getState().activePaneId;
    store.getState().moveTabToPane("tab:a.md", paneId, 1);
    expect(store.getState().root).toBe(before); // same reference = no-op
  });

  it("moveTabToNewPane splits a new pane and moves the tab into it", () => {
    const a = store.getState().openPinned({ path: "a.md" });
    const b = store.getState().openPinned({ path: "b.md" });

    store.getState().moveTabToNewPane(
      a,
      store.getState().activePaneId,
      "vertical",
    );

    const leaves = collectLeaves(store.getState().root);
    expect(leaves).toHaveLength(2);
    const newLeaf = leaves.find((l) => l.tabGroup.tabIds.includes(a))!;
    expect(newLeaf.tabGroup.activeTabId).toBe(a);
    const oldLeaf = leaves.find((l) => l.id !== newLeaf.id)!;
    expect(oldLeaf.tabGroup.tabIds).toEqual([b]);
    expect(store.getState().activePaneId).toBe(newLeaf.id);
    expect(store.getState().tabs[a]).toMatchObject({
      isPinned: true,
      isPreview: false,
    });
  });

  it("openView attaches a view tab to the active leaf and activates it", () => {
    store.getState().openPinned({ path: "a.md" });
    const graphId = store.getState().openView("graph", { title: "Graph" });

    expect(graphId).toBe("tab:view://graph");
    expect(store.getState().tabs["tab:view://graph"]).toMatchObject({
      id: "tab:view://graph",
      path: "view://graph",
      title: "Graph",
      leafType: "graph",
      isPinned: true,
      isPreview: false,
    });

    const leaf = findLeaf(store.getState().root, store.getState().activePaneId);
    expect(leaf?.tabGroup.tabIds).toContain("tab:view://graph");
    expect(leaf?.tabGroup.activeTabId).toBe("tab:view://graph");
  });

  it("openView is idempotent: reopening activates the existing tab, no duplicate", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().openView("graph", { title: "Graph" });

    const count = (ids: TabId[]) =>
      ids.filter((id) => id === "tab:view://graph").length;

    const first = findLeaf(
      store.getState().root,
      store.getState().activePaneId,
    );
    expect(count(first?.tabGroup.tabIds ?? [])).toBe(1);

    // Switch back to the note, then reopen the graph — must not duplicate.
    store.getState().activateTab("tab:a.md");
    store.getState().openView("graph", { title: "Graph" });

    const second = findLeaf(
      store.getState().root,
      store.getState().activePaneId,
    );
    expect(count(second?.tabGroup.tabIds ?? [])).toBe(1);
    expect(second?.tabGroup.activeTabId).toBe("tab:view://graph");
  });

  it("openView lands in the ACTIVE pane after a split (deep leaf)", () => {
    store.getState().openPinned({ path: "a.md" });
    store.getState().splitActivePane("vertical");
    collectLeaves(store.getState().root); // [clone pane] is active now

    store.getState().openView("graph", { title: "Graph" });

    const target = findLeaf(
      store.getState().root,
      store.getState().activePaneId,
    );
    expect(target?.tabGroup.tabIds).toContain("tab:view://graph");
    expect(target?.tabGroup.activeTabId).toBe("tab:view://graph");
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

  it("openView self-heals a mid-session orphaned graph tab (in tabs, no pane)", () => {
    store.getState().openPinned({ path: "a.md" });

    // Simulate corruption at runtime: graph tab lives in `tabs` but refers to
    // no leaf. Before the fix openView found it and activateTab no-oped.
    store.setState((s) => ({
      tabs: {
        ...s.tabs,
        "tab:view://graph": {
          id: "tab:view://graph",
          path: "view://graph",
          title: "Graph",
          leafType: "graph",
          viewMode: "edit",
          isPinned: true,
          isPreview: false,
          isDirty: false,
          createdAt: 1,
          lastAccessedAt: 1,
        },
      },
    }));
    expect(
      findLeafByTab(store.getState().root, "tab:view://graph"),
    ).toBeNull();

    store.getState().openView("graph", { title: "Graph" });

    const leaf = findLeaf(
      store.getState().root,
      store.getState().activePaneId,
    );
    expect(leaf?.tabGroup.tabIds).toContain("tab:view://graph");
    expect(leaf?.tabGroup.activeTabId).toBe("tab:view://graph");
  });

  it("open actions fall back to the first leaf and repair a stale activePaneId", () => {
    store.getState().openPinned({ path: "a.md" });

    // Corrupt activePaneId to a pane that doesn't exist in the tree.
    store.setState({ activePaneId: "pane-ghost" });

    const id = store.getState().openPinned({ path: "b.md" });

    const leaf = findLeaf(
      store.getState().root,
      store.getState().activePaneId,
    );
    expect(leaf).not.toBeNull();
    expect(store.getState().activePaneId).toBe(leaf?.id);
    expect(leaf?.tabGroup.tabIds).toContain(id);
    expect(leaf?.tabGroup.activeTabId).toBe(id);
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
