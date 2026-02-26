import { useMemo } from "react";
import { useTabsStore } from "../store";
import type { TabGroupId, TabModel } from "../types";

export function useTabs() {
  const tabs = useTabsStore((state) => state.tabs);
  const groups = useTabsStore((state) => state.groups);
  const groupOrder = useTabsStore((state) => state.groupOrder);
  const focusedGroupId = useTabsStore((state) => state.focusedGroupId);
  const openInPreview = useTabsStore((state) => state.openInPreview);
  const openPinned = useTabsStore((state) => state.openPinned);
  const activateTab = useTabsStore((state) => state.activateTab);
  const setFocusedGroup = useTabsStore((state) => state.setFocusedGroup);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);
  const setTabTitle = useTabsStore((state) => state.setTabTitle);
  const pinTab = useTabsStore((state) => state.pinTab);
  const unpinTab = useTabsStore((state) => state.unpinTab);
  const togglePinTab = useTabsStore((state) => state.togglePinTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const closeOtherTabs = useTabsStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useTabsStore((state) => state.closeTabsToRight);
  const moveTabWithinGroup = useTabsStore((state) => state.moveTabWithinGroup);
  const moveTabBetweenGroups = useTabsStore((state) => state.moveTabBetweenGroups);
  const splitGroupWithTab = useTabsStore((state) => state.splitGroupWithTab);
  const removeGroup = useTabsStore((state) => state.removeGroup);
  const toWorkspaceSnapshot = useTabsStore((state) => state.toWorkspaceSnapshot);
  const hydrateFromWorkspaceSnapshot = useTabsStore(
    (state) => state.hydrateFromWorkspaceSnapshot,
  );
  const reset = useTabsStore((state) => state.reset);

  const orderedGroups = useMemo(
    () =>
      groupOrder
        .map((groupId) => groups[groupId])
        .filter((group): group is NonNullable<(typeof groups)[TabGroupId]> => Boolean(group)),
    [groups, groupOrder],
  );

  const activeTabsByGroup = useMemo(() => {
    const map: Record<TabGroupId, TabModel | null> = {};
    for (const group of orderedGroups) {
      map[group.id] = group.activeTabId ? tabs[group.activeTabId] ?? null : null;
    }
    return map;
  }, [orderedGroups, tabs]);

  return {
    tabs,
    groups,
    groupOrder,
    orderedGroups,
    focusedGroupId,
    activeTabsByGroup,
    openInPreview,
    openPinned,
    activateTab,
    setFocusedGroup,
    markTabDirty,
    setTabTitle,
    pinTab,
    unpinTab,
    togglePinTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    moveTabWithinGroup,
    moveTabBetweenGroups,
    splitGroupWithTab,
    removeGroup,
    toWorkspaceSnapshot,
    hydrateFromWorkspaceSnapshot,
    reset,
  };
}
