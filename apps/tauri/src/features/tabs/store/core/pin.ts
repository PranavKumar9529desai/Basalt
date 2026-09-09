import type { StateCreator } from "zustand";
import type { TabsState } from "../types";
import { findLeafByTab, mapLeaf } from "../../lib/layoutTree";

export interface PinSlice {
  pinTab: TabsState["pinTab"];
  unpinTab: TabsState["unpinTab"];
  togglePinTab: TabsState["togglePinTab"];
}

export const createPinSlice: StateCreator<TabsState, [], [], PinSlice> = (
  set,
  get,
) => ({
  pinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const leaf = findLeafByTab(state.root, tabId);
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: true, isPreview: false },
        },
        root:
          leaf && leaf.tabGroup.previewTabId === tabId
            ? mapLeaf(state.root, leaf.id, (l) => ({
                ...l,
                tabGroup: { ...l.tabGroup, previewTabId: null },
              }))
            : state.root,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  unpinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: false },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  togglePinTab: (tabId) => {
    const tab = get().tabs[tabId];
    if (!tab) return;
    if (tab.isPinned) {
      get().unpinTab(tabId);
    } else {
      get().pinTab(tabId);
    }
  },
});
