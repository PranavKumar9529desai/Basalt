import { useCallback } from "react";
import type { TabModel } from "../../features/tabs";

interface TabActions {
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string, opts: { force: boolean }) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  togglePinTab: (tabId: string) => void;
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
  } = tabActions;

  const handleTabSelect = useCallback(
    (tabId: string) => {
      activateTab(tabId);
    },
    [activateTab],
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      closeTab(tabId, { force: true });
    },
    [closeTab],
  );

  const handleTabPinToggle = togglePinTab;

  const handleCloseActiveTab = useCallback(() => {
    if (focusedSessionTab) closeTab(focusedSessionTab.id, { force: true });
  }, [focusedSessionTab, closeTab]);

  const handleCloseOtherTabs = useCallback(() => {
    if (focusedSessionTab) closeOtherTabs(focusedSessionTab.id);
  }, [focusedSessionTab, closeOtherTabs]);

  const handleCloseTabsToRight = useCallback(() => {
    if (focusedSessionTab) closeTabsToRight(focusedSessionTab.id);
  }, [focusedSessionTab, closeTabsToRight]);

  const handleTogglePinActiveTab = useCallback(() => {
    if (focusedSessionTab) togglePinTab(focusedSessionTab.id);
  }, [focusedSessionTab, togglePinTab]);

  return {
    handleTabSelect,
    handleTabClose,
    handleTabPinToggle,
    handleCloseActiveTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleTogglePinActiveTab,
  };
}
