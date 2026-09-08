import type { TabId, TabModel } from "./types";

/**
 * Look up a tab model by file path within an ordered set of tab ids (a
 * pane's tab group).
 * Returns null if no tab is open for that path.
 *
 * Matches on the tab's `path` field, NOT on `tabIdFromPath(path)`: a
 * moved note keeps its original (path-derived) id after updateTabPaths
 * repoints its path in place, so id derivation misses it.
 */
export function getTabByPath(
  tabIds: readonly TabId[],
  tabs: Record<TabId, TabModel>,
  path: string,
): TabModel | null {
  for (const tabId of tabIds) {
    const tab = tabs[tabId];
    if (tab?.path === path) return tab;
  }
  return null;
}
