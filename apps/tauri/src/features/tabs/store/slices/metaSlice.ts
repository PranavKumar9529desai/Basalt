import type { StateCreator } from "zustand";
import { findGroupForTab } from "../helpers";
import type { TabsState } from "../types";

export interface MetaSlice {
  markTabDirty: TabsState["markTabDirty"];
  setTabTitle: TabsState["setTabTitle"];
  pinTab: TabsState["pinTab"];
  unpinTab: TabsState["unpinTab"];
  togglePinTab: TabsState["togglePinTab"];
}

export const createMetaSlice: StateCreator<TabsState, [], [], MetaSlice> = (
  set,
  get,
) => ({
  markTabDirty: (tabId, isDirty) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      if (tab.isDirty === isDirty) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            isDirty,
          },
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
          [tabId]: {
            ...tab,
            title,
          },
        },
      };
    });
  },

  pinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;

      const groupId = findGroupForTab(state.groups, tabId);
      if (!groupId) return state;
      const group = state.groups[groupId];

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            isPinned: true,
            isPreview: false,
          },
        },
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            previewTabId:
              group.previewTabId === tabId ? null : group.previewTabId,
          },
        },
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
          [tabId]: {
            ...tab,
            isPinned: false,
          },
        },
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
