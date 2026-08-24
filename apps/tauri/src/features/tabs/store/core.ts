import { leafRegistry } from "@workspace/views";
import type { StateCreator } from "zustand";
import { ROOT_PANE_ID } from "../constants";
import type { TabId, TabModel, TabPaneId } from "../types";
import type { TabsState } from "./types";

function nowMs() {
  return Date.now();
}

function makeTabId(path: string): TabId {
  return `tab:${path}` as TabId;
}

function titleFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? path;
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

function removeTabFromPane(pane: TabsState["pane"], tabId: TabId): void {
  pane.tabIds = pane.tabIds.filter((id) => id !== tabId);
  if (pane.previewTabId === tabId) pane.previewTabId = null;
  if (pane.activeTabId === tabId) {
    pane.activeTabId =
      pane.tabIds.length > 0
        ? (pane.tabIds[pane.tabIds.length - 1] as TabId | null)
        : null;
  }
}

function buildInitialState() {
  return {
    tabs: {} as Record<TabId, TabModel>,
    pane: {
      id: ROOT_PANE_ID as TabPaneId,
      tabIds: [],
      activeTabId: null,
      previewTabId: null,
    },
    persistVersion: 0,
  };
}

/**
 * Core slice — all tab state mutations in one StateCreator. Single-pane
 * model: one TabPane holds all open tabs.
 */
export interface CoreSlice {
  openInPreview: TabsState["openInPreview"];
  openPinned: TabsState["openPinned"];
  activateTab: TabsState["activateTab"];
  closeTab: TabsState["closeTab"];
  closeOtherTabs: TabsState["closeOtherTabs"];
  closeTabsToRight: TabsState["closeTabsToRight"];
  markTabDirty: TabsState["markTabDirty"];
  setTabTitle: TabsState["setTabTitle"];
  pinTab: TabsState["pinTab"];
  unpinTab: TabsState["unpinTab"];
  togglePinTab: TabsState["togglePinTab"];
  moveTabWithinPane: TabsState["moveTabWithinPane"];

  reset: TabsState["reset"];
}

export const createCoreSlice: StateCreator<TabsState, [], [], CoreSlice> = (
  set,
  get,
) => ({
  openInPreview: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

    const existingTab = get().tabs[incomingTabId];
    if (existingTab) {
      if (activate) get().activateTab(incomingTabId);
      return incomingTabId;
    }

    const current = get();
    const tabs = { ...current.tabs };
    const pane = { ...current.pane };

    if (pane.previewTabId) {
      const preview = tabs[pane.previewTabId];
      if (preview && !preview.isDirty) {
        delete tabs[preview.id];
        removeTabFromPane(pane, preview.id);
      } else if (preview) {
        preview.isPreview = false;
        preview.isPinned = true;
        pane.previewTabId = null;
      }
    }

    const timestamp = nowMs();
    tabs[incomingTabId] = {
      id: incomingTabId,
      path: note.path,
      title: note.title ?? titleFromPath(note.path),
      leafType: leafRegistry.leafTypeForPath(note.path) ?? "markdown",
      isPinned: false,
      isPreview: true,
      isDirty: false,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
    };

    pane.tabIds = [...pane.tabIds, incomingTabId];
    pane.previewTabId = incomingTabId;
    if (activate) pane.activeTabId = incomingTabId;

    set({
      tabs,
      pane,
      persistVersion: get().persistVersion + 1,
    });

    return incomingTabId;
  },

  openPinned: (note, options) => {
    const activate = options?.activate ?? true;
    const incomingTabId = makeTabId(note.path) as TabId;

    const existingTab = get().tabs[incomingTabId];
    if (existingTab) {
      get().pinTab(incomingTabId);
      if (activate) get().activateTab(incomingTabId);
      return incomingTabId;
    }

    const current = get();
    const tabs = { ...current.tabs };
    const pane = { ...current.pane };

    const timestamp = nowMs();
    tabs[incomingTabId] = {
      id: incomingTabId,
      path: note.path,
      title: note.title ?? titleFromPath(note.path),
      leafType: leafRegistry.leafTypeForPath(note.path) ?? "markdown",
      isPinned: true,
      isPreview: false,
      isDirty: false,
      createdAt: timestamp,
      lastAccessedAt: timestamp,
    };

    pane.tabIds = [...pane.tabIds, incomingTabId];
    if (activate) pane.activeTabId = incomingTabId;

    set({
      tabs,
      pane,
      persistVersion: get().persistVersion + 1,
    });

    return incomingTabId;
  },

  activateTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || !state.pane.tabIds.includes(tabId)) return state;
      if (state.pane.activeTabId === tabId) return state;
      return {
        pane: { ...state.pane, activeTabId: tabId },
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, lastAccessedAt: nowMs() },
        },
      };
    });
  },

  closeTab: (tabId, options) => {
    const force = options?.force ?? true;
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      if (!force && tab.isDirty) return state;

      const nextTabs = { ...state.tabs };
      delete nextTabs[tabId];

      const pane = { ...state.pane };
      removeTabFromPane(pane, tabId);

      return {
        tabs: nextTabs,
        pane,
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const pane = state.pane;
      if (!pane.tabIds.includes(tabId)) return state;
      const nextTabs = { ...state.tabs };
      for (const candidateId of pane.tabIds) {
        if (candidateId !== tabId) delete nextTabs[candidateId];
      }
      return {
        tabs: nextTabs,
        pane: {
          ...pane,
          tabIds: [tabId],
          activeTabId: tabId,
          previewTabId: pane.previewTabId === tabId ? tabId : null,
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const pane = state.pane;
      const currentIndex = pane.tabIds.indexOf(tabId);
      if (currentIndex === -1) return state;
      const keepIds = pane.tabIds.slice(0, currentIndex + 1);
      const keepSet = new Set(keepIds);
      const nextTabs = { ...state.tabs };
      for (const candidateId of pane.tabIds) {
        if (!keepSet.has(candidateId)) delete nextTabs[candidateId];
      }
      return {
        tabs: nextTabs,
        pane: {
          ...pane,
          tabIds: keepIds,
          activeTabId:
            pane.activeTabId && keepSet.has(pane.activeTabId)
              ? pane.activeTabId
              : tabId,
          previewTabId:
            pane.previewTabId && keepSet.has(pane.previewTabId)
              ? pane.previewTabId
              : null,
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

  pinTab: (tabId) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const pane = state.pane;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...tab, isPinned: true, isPreview: false },
        },
        pane: {
          ...pane,
          previewTabId:
            pane.previewTabId === tabId ? null : pane.previewTabId,
        },
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

  moveTabWithinPane: (fromIndex, toIndex) => {
    set((state) => {
      const pane = state.pane;
      if (
        fromIndex < 0 ||
        fromIndex >= pane.tabIds.length ||
        toIndex < 0 ||
        toIndex >= pane.tabIds.length ||
        fromIndex === toIndex
      ) {
        return state;
      }
      const tabIds = [...pane.tabIds];
      const [moved] = tabIds.splice(fromIndex, 1);
      const insertIndex = Math.max(0, Math.min(toIndex, tabIds.length));
      tabIds.splice(insertIndex, 0, moved);
      return {
        pane: { ...pane, tabIds },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  reset: () => {
    set(buildInitialState());
  },
});
