import type { StateCreator } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type { TabPaneId, TabPane, TabId } from "../types";
import type { TabsState } from "./types";

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
    return {
      version: 1,
      panes: [
        {
          id: state.pane.id,
          tabIds: [...state.pane.tabIds],
          activeTabId: state.pane.activeTabId,
          previewTabId: state.pane.previewTabId,
        },
      ],
      tabs: Object.values(state.tabs).map((tab) => ({
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
      })),
    };
  },

  hydrateFromWorkspaceSnapshot: (snapshot) => {
    if (snapshot.version !== 1) return;

    const tabs = Object.fromEntries(
      snapshot.tabs.map((tab) => [
        tab.id,
        // Older snapshots predate leafType (or carry it as `viewType`) —
        // accept both, default to markdown.
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

    // Accept `panes` (new format) or `groups` (legacy format)
    const paneData = snapshot.panes ?? snapshot.groups;
    const firstPane = paneData?.[0];

    const tabIds = (firstPane?.tabIds ?? []).filter((tabId) =>
      Boolean(tabs[tabId]),
    );
    const pane: TabPane = {
      id: (firstPane?.id as TabPaneId) ?? (ROOT_PANE_ID as TabPaneId),
      tabIds,
      // Keep the saved active tab when it still exists; old snapshots have a
      // null active id and fall back to the last surviving tab.
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

    set({ tabs, pane });
  },
});
