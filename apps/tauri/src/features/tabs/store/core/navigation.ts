import type { StateCreator } from "zustand";
import type { TabId, NavigationHistoryEntry } from "../../types";
import type { TabsState } from "../types";
import { findLeaf } from "../../lib/layoutTree";

function nowMs() {
  return Date.now();
}

function resolveActiveTabId(
  state: TabsState,
  explicitTabId?: TabId,
): TabId | null {
  if (explicitTabId) return explicitTabId;
  const leaf = findLeaf(state.root, state.activePaneId);
  return leaf?.tabGroup.activeTabId ?? null;
}

export interface NavigationSlice {
  navigateBack: TabsState["navigateBack"];
  navigateForward: TabsState["navigateForward"];
  navigateToHistoryIndex: TabsState["navigateToHistoryIndex"];
  pushTabHistory: TabsState["pushTabHistory"];
}

export const createNavigationSlice: StateCreator<
  TabsState,
  [],
  [],
  NavigationSlice
> = (set) => ({
  navigateBack: (explicitTabId) => {
    set((state) => {
      const tabId = resolveActiveTabId(state, explicitTabId);
      if (!tabId) return state;
      const tab = state.tabs[tabId];
      if (!tab || !tab.history || (tab.historyIndex ?? 0) <= 0) {
        return state;
      }
      const nextIndex = (tab.historyIndex ?? 0) - 1;
      const targetEntry = tab.history[nextIndex];
      if (!targetEntry) return state;

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            path: targetEntry.path,
            title: targetEntry.title,
            leafType: targetEntry.leafType,
            viewMode: targetEntry.viewMode ?? tab.viewMode,
            line: targetEntry.line,
            historyIndex: nextIndex,
            lastAccessedAt: nowMs(),
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  navigateForward: (explicitTabId) => {
    set((state) => {
      const tabId = resolveActiveTabId(state, explicitTabId);
      if (!tabId) return state;
      const tab = state.tabs[tabId];
      if (
        !tab ||
        !tab.history ||
        (tab.historyIndex ?? 0) >= tab.history.length - 1
      ) {
        return state;
      }
      const nextIndex = (tab.historyIndex ?? 0) + 1;
      const targetEntry = tab.history[nextIndex];
      if (!targetEntry) return state;

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            path: targetEntry.path,
            title: targetEntry.title,
            leafType: targetEntry.leafType,
            viewMode: targetEntry.viewMode ?? tab.viewMode,
            line: targetEntry.line,
            historyIndex: nextIndex,
            lastAccessedAt: nowMs(),
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  navigateToHistoryIndex: (tabId, index) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab || !tab.history || index < 0 || index >= tab.history.length) {
        return state;
      }
      if (tab.historyIndex === index) return state;
      const targetEntry = tab.history[index];
      if (!targetEntry) return state;

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            path: targetEntry.path,
            title: targetEntry.title,
            leafType: targetEntry.leafType,
            viewMode: targetEntry.viewMode ?? tab.viewMode,
            line: targetEntry.line,
            historyIndex: index,
            lastAccessedAt: nowMs(),
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },

  pushTabHistory: (tabId, entry) => {
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;
      const history = tab.history ? [...tab.history] : [];
      const currentIndex = tab.historyIndex ?? 0;

      // Don't push identical consecutive history entries
      const current = history[currentIndex];
      if (
        current &&
        current.path === entry.path &&
        current.leafType === entry.leafType &&
        current.line === entry.line &&
        current.viewMode === entry.viewMode
      ) {
        return state;
      }

      // Truncate any forward history when navigating from an earlier point
      const truncated = history.slice(0, currentIndex + 1);
      const newEntry: NavigationHistoryEntry = {
        ...entry,
        timestamp: nowMs(),
      };
      truncated.push(newEntry);
      const newIndex = truncated.length - 1;

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            path: entry.path,
            title: entry.title,
            leafType: entry.leafType,
            viewMode: entry.viewMode ?? tab.viewMode,
            line: entry.line,
            history: truncated,
            historyIndex: newIndex,
            lastAccessedAt: nowMs(),
          },
        },
        persistVersion: state.persistVersion + 1,
      };
    });
  },
});
