import type { TabId, TabPane, TabPaneId, TabModel } from "./types";

/** Construct the stable tab ID for a given file path. */
export function tabIdFromPath(path: string): TabId {
  return `tab:${path}` as TabId;
}

/**
 * Check if a tab exists in the pane.
 * Returns the pane ID or null if the tab isn't open.
 */
export function findPaneForTab(pane: TabPane, tabId: TabId): TabPaneId | null {
  return pane.tabIds.includes(tabId) ? pane.id : null;
}

/**
 * Look up a tab model by file path.
 * Returns null if no tab is open for that path.
 *
 * Matches on the tab's `path` field, NOT on `tabIdFromPath(path)`: a
 * moved note keeps its original (path-derived) id after updateTabPaths
 * repoints its path in place, so id derivation misses it.
 */
export function getTabByPath(
  pane: TabPane,
  tabs: Record<TabId, TabModel>,
  path: string,
): TabModel | null {
  for (const tabId of pane.tabIds) {
    const tab = tabs[tabId];
    if (tab?.path === path) return tab;
  }
  return null;
}
