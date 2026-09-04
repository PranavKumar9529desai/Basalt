import type { StateCreator } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type {
  TabPaneId,
  TabPane,
  TabId,
  PaneId,
  LayoutNode,
} from "../types";
import type { TabsState } from "./types";
import {
  serializeNode,
  deserializeNode,
  createLeaf,
} from "../lib/layoutTree";

export interface PersistenceSlice {
  toWorkspaceSnapshot: TabsState["toWorkspaceSnapshot"];
  hydrateFromWorkspaceSnapshot: TabsState["hydrateFromWorkspaceSnapshot"];
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

    // Phase 1: derive v2 root from flat pane state.
    // In a future phase, root becomes the source of truth and pane is derived.
    const root = serializeNode(state.root);
    if (root.type === "leaf") {
      root.tabGroup = {
        id: state.pane.id,
        tabIds: [...state.pane.tabIds],
        activeTabId: state.pane.activeTabId,
        previewTabId: state.pane.previewTabId,
      };
    }

    return {
      version: 2 as const,
      root,
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
      // V2: deserialize the layout tree
      const root = deserializeNode(snapshot.root);

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

      // Phase 1: derive flat pane from active leaf for backward compat.
      const leaf = findLeafById(root, activePaneId);
      const tg = leaf?.tabGroup;

      const pane: TabPane = {
        id: (tg?.id ?? ROOT_PANE_ID) as TabPaneId,
        tabIds: (tg?.tabIds ?? []).filter((id) => Boolean(tabs[id])),
        activeTabId:
          tg?.activeTabId && tabs[tg.activeTabId] ? tg.activeTabId : null,
        previewTabId:
          tg?.previewTabId && tabs[tg.previewTabId] ? tg.previewTabId : null,
      };

      set({ tabs, root, activePaneId, pane });
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
      pane,
      root: leaf,
      activePaneId: leaf.id,
    });
  },
});
