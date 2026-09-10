import type { StateCreator } from "zustand";
import type { TabsState } from "../types";
import { findLeafByTab, mapLeaf } from "../../lib/layoutTree";

function nowMs() {
  return Date.now();
}

export interface ActivateSlice {
  activateTab: TabsState["activateTab"];
  markTabDirty: TabsState["markTabDirty"];
  setTabTitle: TabsState["setTabTitle"];
  setTabViewMode: TabsState["setTabViewMode"];
}

export const createActivateSlice: StateCreator<
  TabsState,
  [],
  [],
  ActivateSlice
> = (set) => ({
  activateTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;
      if (
        state.activePaneId === leaf.id &&
        leaf.tabGroup.activeTabId === tabId
      ) {
        return state;
      }
      return {
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: { ...l.tabGroup, activeTabId: tabId },
        })),
        activePaneId: leaf.id,
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, lastAccessedAt: nowMs() },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  markTabDirty: (tabId, isDirty) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.isDirty === isDirty) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isDirty },
        },
      };
    });
  },

  setTabTitle: (tabId, title) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.title === title) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, title },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  setTabViewMode: (tabId, mode) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || tab.leafType !== "markdown" || tab.viewMode === mode) {
        return state;
      }
      return {
        tabs: { ...state.tabs, [tabId]: { ...tab, viewMode: mode } },
        persistVersion: state.persistVersion + 1,
      };
    });
  },
});
