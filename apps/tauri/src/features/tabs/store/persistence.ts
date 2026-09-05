import type { StateCreator } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type {
  TabPaneId,
  TabPane,
  TabId,
  TabModel,
  PaneId,
  LayoutNode,
  TabGroup,
} from "../types";
import type { TabsState } from "./types";
import {
  serializeNode,
  deserializeNode,
  createLeaf,
  mapLeaves,
  collectLeaves,
} from "../lib/layoutTree";

export interface PersistenceSlice {
  toWorkspaceSnapshot: TabsState["toWorkspaceSnapshot"];
  hydrateFromWorkspaceSnapshot: TabsState["hydrateFromWorkspaceSnapshot"];
}

/** Drop references to tabs no longer present in the `tabs` map. */
function sanitizeTabGroup(
  group: TabGroup,
  tabs: Record<TabId, TabModel>,
): TabGroup {
  const tabIds = group.tabIds.filter((id) => Boolean(tabs[id]));
  return {
    ...group,
    tabIds,
    activeTabId:
      group.activeTabId && tabs[group.activeTabId]
        ? group.activeTabId
        : (tabIds[tabIds.length - 1] ?? null),
    previewTabId:
      group.previewTabId && tabs[group.previewTabId]
        ? group.previewTabId
        : null,
  };
}

export const createPersistenceSlice: StateCreator<
  TabsState,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  toWorkspaceSnapshot: () => {
    const state = get();
    const serializedTabs = Object.values(state.tabs).map((tab) => ({
      id: tab.id,
      path: tab.path,
      title: tab.title,
      leafType: tab.leafType,
      viewMode: tab.viewMode,
      isPinned: tab.isPinned,
      isPreview: tab.isPreview,
      isDirty: tab.isDirty,
      createdAt: tab.createdAt,
      lastAccessedAt: tab.lastAccessedAt,
    }));

    return {
      version: 2 as const,
      root: serializeNode(state.root),
      activePaneId: state.activePaneId,
      tabs: serializedTabs,
    };
  },

  hydrateFromWorkspaceSnapshot: (snapshot) => {
    const tabs = Object.fromEntries(
      snapshot.tabs.map((tab) => [
        tab.id,
        {
          ...tab,
          leafType:
            (tab as { leafType?: string }).leafType ??
            (tab as { viewType?: string }).viewType ??
            "markdown",
          viewMode: tab.viewMode === "reading" ? "reading" : "edit",
        },
      ]),
    ) as Record<TabId, import("../types").TabModel>;

    if (snapshot.version === 2) {
      // V2: deserialize the layout tree, sanitize each leaf's tab group
      // against the tabs map, and restore focus to the recorded pane.
      const root = mapLeaves(deserializeNode(snapshot.root), (leaf) => ({
        ...leaf,
        tabGroup: sanitizeTabGroup(leaf.tabGroup, tabs),
      }));

      // Prune tabs orphaned in the tree. A tab in `tabs` that no leaf's
      // tabGroup references is invisible to every pane: openView finds it
      // and `activateTab` silently no-ops on it (graph-open regression).
      // They were already unreachable, so dropping them heals the snapshot
      // instead of resurrecting stale duplicates on every boot.
      const referenced = new Set<TabId>();
      for (const leaf of collectLeaves(root)) {
        for (const id of leaf.tabGroup.tabIds) referenced.add(id);
      }
      const prunedTabs: typeof tabs = {};
      for (const [id, tab] of Object.entries(tabs)) {
        if (referenced.has(id as TabId)) prunedTabs[id as TabId] = tab;
      }

      const findLeafById = (
        node: LayoutNode,
        id: PaneId,
      ): import("../types").LeafNode | null => {
        if (node.type === "leaf" && node.id === id) return node;
        if (node.type === "leaf") return null;
        for (const child of node.children) {
          const found = findLeafById(child, id);
          if (found) return found;
        }
        return null;
      };

      const findFirstLeaf = (node: LayoutNode): PaneId | null => {
        if (node.type === "leaf") return node.id;
        for (const child of node.children) {
          const found = findFirstLeaf(child);
          if (found) return found;
        }
        return null;
      };

      const firstLeafId = findFirstLeaf(root);
      const activePaneId =
        snapshot.activePaneId && findLeafById(root, snapshot.activePaneId)
          ? snapshot.activePaneId
          : (firstLeafId ?? (ROOT_PANE_ID as PaneId));

      set({ tabs: prunedTabs, root, activePaneId });
      return;
    }

    // V1: legacy single-pane format — wrap in a leaf node
    if (snapshot.version !== 1) return;

    const paneData = snapshot.panes ?? snapshot.groups;
    const firstPane = paneData?.[0];

    const tabIds = (firstPane?.tabIds ?? []).filter((tabId) =>
      Boolean(tabs[tabId]),
    );
    const pane: TabPane = {
      id: (firstPane?.id as TabPaneId) ?? (ROOT_PANE_ID as TabPaneId),
      tabIds,
      activeTabId:
        firstPane?.activeTabId && tabs[firstPane.activeTabId]
          ? (firstPane.activeTabId as TabId)
          : tabIds.length > 0
            ? (tabIds[tabIds.length - 1] as TabId)
            : null,
      previewTabId:
        firstPane?.previewTabId && tabs[firstPane.previewTabId]
          ? (firstPane.previewTabId as TabId)
          : null,
    };

    // Wrap legacy pane in a leaf node
    const leaf = createLeaf(tabIds);
    leaf.tabGroup.activeTabId = pane.activeTabId;
    leaf.tabGroup.previewTabId = pane.previewTabId;

    set({
      tabs,
      root: leaf,
      activePaneId: leaf.id,
    });
  },
});