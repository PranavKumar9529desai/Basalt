import type { StateCreator } from "zustand";
import type { TabsState } from "../types";
import {
  collectLeaves,
  findLeafByTab,
  mapLeaf,
  removeLeaf,
} from "../../lib/layoutTree";

export interface CloseSlice {
  closeTab: TabsState["closeTab"];
  closeOtherTabs: TabsState["closeOtherTabs"];
  closeTabsToRight: TabsState["closeTabsToRight"];
}

export const createCloseSlice: StateCreator<
  TabsState,
  [],
  [],
  CloseSlice
> = (set) => ({
  closeTab: (tabId, options) => {
    const force = options?.force ?? true;
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      if (!force && tab.isDirty) return state;

      const tabs = { ...state.tabs };
      delete tabs[tabId];

      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return { ...state, tabs };

      const group = leaf.tabGroup;
      const remaining = group.tabIds.filter((id) => id !== tabId);
      const leaves = collectLeaves(state.root);
      const isLastInPane = remaining.length === 0;
      const onlyPane = leaves.length === 1;

      // Closing the last tab of a pane closes the pane itself (ADR-032
      // validation), unless it is the only pane left.
      if (isLastInPane && !onlyPane) {
        const newRoot = removeLeaf(state.root, leaf.id);
        if (!newRoot) return { ...state, tabs };
        const remainingLeaves = collectLeaves(newRoot);
        const activePaneId =
          state.activePaneId === leaf.id
            ? (remainingLeaves[0]?.id ?? state.activePaneId)
            : state.activePaneId;
        return {
          tabs,
          root: newRoot,
          activePaneId,
          persistVersion: state.persistVersion + 1,
        };
      }

      const removedIndex = group.tabIds.indexOf(tabId);
      const activeTabId =
        group.activeTabId === tabId
          ? (remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null)
          : group.activeTabId;

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: remaining,
            activeTabId,
            previewTabId:
              l.tabGroup.previewTabId === tabId
                ? null
                : l.tabGroup.previewTabId,
          },
        })),
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;

      const tabs = { ...state.tabs };
      for (const candidateId of leaf.tabGroup.tabIds) {
        if (candidateId !== tabId) delete tabs[candidateId];
      }

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: [tabId],
            activeTabId: tabId,
            previewTabId: l.tabGroup.previewTabId === tabId ? tabId : null,
          },
        })),
        activePaneId: leaf.id,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const leaf = findLeafByTab(state.root, tabId);
      if (!leaf) return state;

      const currentIndex = leaf.tabGroup.tabIds.indexOf(tabId);
      if (currentIndex === -1) return state;
      const keepIds = leaf.tabGroup.tabIds.slice(0, currentIndex + 1);
      const keepSet = new Set(keepIds);

      const tabs = { ...state.tabs };
      for (const candidateId of leaf.tabGroup.tabIds) {
        if (!keepSet.has(candidateId)) delete tabs[candidateId];
      }

      return {
        tabs,
        root: mapLeaf(state.root, leaf.id, (l) => ({
          ...l,
          tabGroup: {
            ...l.tabGroup,
            tabIds: keepIds,
            activeTabId:
              l.tabGroup.activeTabId && keepSet.has(l.tabGroup.activeTabId)
                ? l.tabGroup.activeTabId
                : tabId,
            previewTabId:
              l.tabGroup.previewTabId && keepSet.has(l.tabGroup.previewTabId)
                ? l.tabGroup.previewTabId
                : null,
          },
        })),
        activePaneId: leaf.id,
        persistVersion: state.persistVersion + 1,
      };
    });
  },
});