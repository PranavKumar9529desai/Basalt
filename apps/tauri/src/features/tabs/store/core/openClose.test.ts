import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TabId } from "../../types";
import { collectLeaves, findLeaf, findLeafByTab } from "../../lib/layoutTree";
import { createTestStore, type TestStore } from "./testUtils";

vi.mock("@workspace/views", () => ({
  leafRegistry: { leafTypeForPath: () => "markdown" },
}));

describe("openClose slice", () => {
  let store: TestStore;
  beforeEach(() => {
    store = createTestStore();
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
    expect(findLeafByTab(store.getState().root, "tab:view://graph")).toBeNull();

    store.getState().openView("graph", { title: "Graph" });

    const leaf = findLeaf(store.getState().root, store.getState().activePaneId);
    expect(leaf?.tabGroup.tabIds).toContain("tab:view://graph");
    expect(leaf?.tabGroup.activeTabId).toBe("tab:view://graph");
  });

  it("open actions fall back to the first leaf and repair a stale activePaneId", () => {
    store.getState().openPinned({ path: "a.md" });

    // Corrupt activePaneId to a pane that doesn't exist in the tree.
    store.setState({ activePaneId: "pane-ghost" });

    const id = store.getState().openPinned({ path: "b.md" });

    const leaf = findLeaf(store.getState().root, store.getState().activePaneId);
    expect(leaf).not.toBeNull();
    expect(store.getState().activePaneId).toBe(leaf?.id);
    expect(leaf?.tabGroup.tabIds).toContain(id);
    expect(leaf?.tabGroup.activeTabId).toBe(id);
  });
});
