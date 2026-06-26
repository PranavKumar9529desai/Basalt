import { useCallback } from "react";
import type {
  SplitDirection,
  TabGroupId,
  TabGroupModel,
  TabId,
  TabModel,
} from "../../features/tabs";
import { findGroupForTab, useTabsStore } from "../../features/tabs";

interface TabActions {
  activateTab: (groupId: TabGroupId, tabId: string) => void;
  closeTab: (
    groupId: TabGroupId,
    tabId: string,
    opts: { force: boolean },
  ) => void;
  closeOtherTabs: (groupId: TabGroupId, tabId: string) => void;
  closeTabsToRight: (groupId: TabGroupId, tabId: string) => void;
  togglePinTab: (tabId: string) => void;
  splitGroupWithTab: (
    groupId: TabGroupId,
    direction: SplitDirection,
    tabId: string,
  ) => void;
  setFocusedGroup: (groupId: TabGroupId) => void;
}

interface Props {
  tabActions: TabActions;
  focusedSessionTab: TabModel | null;
}

export function useWorkspaceTabHandlers({
  tabActions,
  focusedSessionTab,
}: Props) {
  const {
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
    setFocusedGroup,
  } = tabActions;

  // Resolve group from store synchronously — avoids unstable callback refs
  // that would cascade re-renders on every tab state change.
  const resolveGroup = useCallback(
    (tabId: string): TabGroupModel | undefined => {
      const groups = useTabsStore.getState().groups;
      const groupId = findGroupForTab(groups, tabId as TabId);
      return groupId ? groups[groupId] : undefined;
    },
    [],
  );

  const handleTabSelect = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      setFocusedGroup(groupId);
      activateTab(groupId, tabId);
    },
    [activateTab, setFocusedGroup],
  );

  const handleTabClose = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      closeTab(groupId, tabId, { force: true });
    },
    [closeTab],
  );

  const handleTabPinToggle = togglePinTab;

  const handleCloseActiveTab = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) closeTab(group.id, focusedSessionTab.id, { force: true });
  }, [focusedSessionTab, resolveGroup, closeTab]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) closeOtherTabs(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, closeOtherTabs]);

  const handleCloseTabsToRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) closeTabsToRight(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, closeTabsToRight]);

  const handleTogglePinActiveTab = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) togglePinTab(focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "right", focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, splitGroupWithTab]);

  const handleSplitLeft = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "left", focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, splitGroupWithTab]);

  const handleSplitUp = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "top", focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, splitGroupWithTab]);

  const handleSplitDown = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = resolveGroup(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "bottom", focusedSessionTab.id);
  }, [focusedSessionTab, resolveGroup, splitGroupWithTab]);

  return {
    handleTabSelect,
    handleTabClose,
    handleTabPinToggle,
    handleCloseActiveTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleTogglePinActiveTab,
    handleSplitRight,
    handleSplitLeft,
    handleSplitUp,
    handleSplitDown,
  };
}
