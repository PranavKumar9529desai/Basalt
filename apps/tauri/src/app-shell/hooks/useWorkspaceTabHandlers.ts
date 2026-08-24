import { useCallback } from "react";

interface TabActions {
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string, opts: { force: boolean }) => void;
  togglePinTab: (tabId: string) => void;
}

interface Props {
  tabActions: TabActions;
}

export function useWorkspaceTabHandlers({ tabActions }: Props) {
  const { activateTab, closeTab, togglePinTab } = tabActions;

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

  return {
    handleTabSelect,
    handleTabClose,
    handleTabPinToggle,
  };
}
