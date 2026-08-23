// ---------------------------------------------------------------------------
// Persistence slice — workspace snapshot export/hydrate
// ---------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type { TabPaneId, TabPane, TabId } from "../types";
import type { TabsState } from "./types";

// ---- slice interface ----

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
      tabs: Object.values(state.tabs).map((tab) => ({ ...tab })),
    };
  },

  hydrateFromWorkspaceSnapshot: (snapshot) => {
    if (snapshot.version !== 1) return;

    const tabs = Object.fromEntries(
      snapshot.tabs.map((tab) => [tab.id, tab]),
    ) as Record<TabId, import("../types").TabModel>;

    // Accept `panes` (new format) or `groups` (legacy format)
    const paneData = snapshot.panes ?? snapshot.groups;
    const firstPane = paneData?.[0];

    const pane: TabPane = {
      id: (firstPane?.id as TabPaneId) ?? (ROOT_PANE_ID as TabPaneId),
      tabIds: (firstPane?.tabIds ?? []).filter((tabId) => Boolean(tabs[tabId])),
      activeTabId:
        firstPane?.activeTabId && tabs[firstPane.activeTabId]
          ? (firstPane.activeTabId as TabId)
          : null,
      previewTabId:
        firstPane?.previewTabId && tabs[firstPane.previewTabId]
          ? (firstPane.previewTabId as TabId)
          : null,
    };

    set({ tabs, pane });
  },
});
