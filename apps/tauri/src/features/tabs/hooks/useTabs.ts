import { useMemo } from "react";
import { useTabsStore } from "../store";
import type { TabGroupId, TabModel } from "../types";

export function useTabs() {
  const tabs = useTabsStore((state) => state.tabs);
  const groups = useTabsStore((state) => state.groups);
  const groupOrder = useTabsStore((state) => state.groupOrder);
  const focusedGroupId = useTabsStore((state) => state.focusedGroupId);

  const actions = useTabsStore((state) => ({
    openInPreview: state.openInPreview,
    openPinned: state.openPinned,
    activateTab: state.activateTab,
    setFocusedGroup: state.setFocusedGroup,
    markTabDirty: state.markTabDirty,
    setTabTitle: state.setTabTitle,
    pinTab: state.pinTab,
    unpinTab: state.unpinTab,
    togglePinTab: state.togglePinTab,
    closeTab: state.closeTab,
    closeOtherTabs: state.closeOtherTabs,
    closeTabsToRight: state.closeTabsToRight,
    moveTabWithinGroup: state.moveTabWithinGroup,
    moveTabBetweenGroups: state.moveTabBetweenGroups,
    splitGroupWithTab: state.splitGroupWithTab,
    removeGroup: state.removeGroup,
    toWorkspaceSnapshot: state.toWorkspaceSnapshot,
    hydrateFromWorkspaceSnapshot: state.hydrateFromWorkspaceSnapshot,
    reset: state.reset,
  }));

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
    ...actions,
  };
}

