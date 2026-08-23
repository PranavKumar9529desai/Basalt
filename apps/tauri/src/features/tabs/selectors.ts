import type { TabId, TabPane, TabPaneId, TabModel } from "./types";

/** Construct the stable tab ID for a given file path. */
export function tabIdFromPath(path: string): TabId {
  return `tab:${path}` as TabId;
}

/**
 * Check if a tab exists in the pane.
 * Returns the pane ID or null if the tab isn't open.
 */
export function findPaneForTab(
  pane: TabPane,
  tabId: TabId,
): TabPaneId | null {
  return pane.tabIds.includes(tabId) ? pane.id : null;
}

/**
 * Look up a tab model by file path.
 * Returns null if no tab is open for that path.
 */
export function getTabByPath(
  pane: TabPane,
  tabs: Record<TabId, TabModel>,
  path: string,
): TabModel | null {
  const id = tabIdFromPath(path);
  if (!pane.tabIds.includes(id)) return null;
  return tabs[id] ?? null;
}
