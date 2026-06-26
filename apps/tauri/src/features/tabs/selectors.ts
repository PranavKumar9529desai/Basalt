import type { TabGroupId, TabGroupModel, TabId, TabModel } from "./types";

/** Construct the stable tab ID for a given file path. */
export function tabIdFromPath(path: string): TabId {
  return `tab:${path}` as TabId;
}

/**
 * Find which group a tab belongs to by scanning all groups.
 * Returns the group ID or null if the tab isn't open.
 */
export function findGroupForTab(
  groups: Record<TabGroupId, TabGroupModel>,
  tabId: TabId,
): TabGroupId | null {
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.tabIds.includes(tabId)) return groupId as TabGroupId;
  }
  return null;
}

/**
 * Look up a tab model by file path.
 * Returns null if no tab is open for that path.
 */
export function getTabByPath(
  groups: Record<TabGroupId, TabGroupModel>,
  tabs: Record<TabId, TabModel>,
  path: string,
): TabModel | null {
  const tabId = tabIdFromPath(path);
  const groupId = findGroupForTab(groups, tabId);
  if (!groupId) return null;
  return tabs[tabId] ?? null;
}
