import { useCallback } from "react";
import type {
  SplitDirection,
  TabGroupId,
  TabGroupModel,
  TabModel,
} from "../../features/tabs";

interface TabActions {
  groups: Record<TabGroupId, TabGroupModel>;
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
    groups,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
    setFocusedGroup,
  } = tabActions;

  const findGroupForTab = useCallback(
    (tabId: string): TabGroupModel | undefined =>
      Object.values(groups).find((g) => g.tabIds.includes(tabId)),
    [groups],
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
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeTab(group.id, focusedSessionTab.id, { force: true });
  }, [focusedSessionTab, findGroupForTab, closeTab]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeOtherTabs(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, closeOtherTabs]);

  const handleCloseTabsToRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) closeTabsToRight(group.id, focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, closeTabsToRight]);

  const handleTogglePinActiveTab = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) togglePinTab(focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "right", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitLeft = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "left", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitUp = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "top", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

  const handleSplitDown = useCallback(() => {
    if (!focusedSessionTab) return;
    const group = findGroupForTab(focusedSessionTab.id);
    if (group) splitGroupWithTab(group.id, "bottom", focusedSessionTab.id);
  }, [focusedSessionTab, findGroupForTab, splitGroupWithTab]);

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
