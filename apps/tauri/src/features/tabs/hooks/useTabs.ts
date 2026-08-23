import { useMemo } from "react";
import { useTabsStore } from "../store";
import type { TabModel } from "../types";

export function useTabs() {
  const tabs = useTabsStore((state) => state.tabs);
  const pane = useTabsStore((state) => state.pane);
  const openInPreview = useTabsStore((state) => state.openInPreview);
  const openPinned = useTabsStore((state) => state.openPinned);
  const activateTab = useTabsStore((state) => state.activateTab);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);
  const setTabTitle = useTabsStore((state) => state.setTabTitle);
  const pinTab = useTabsStore((state) => state.pinTab);
  const unpinTab = useTabsStore((state) => state.unpinTab);
  const togglePinTab = useTabsStore((state) => state.togglePinTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const closeOtherTabs = useTabsStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useTabsStore((state) => state.closeTabsToRight);
  const moveTabWithinPane = useTabsStore((state) => state.moveTabWithinPane);
  const toWorkspaceSnapshot = useTabsStore(
    (state) => state.toWorkspaceSnapshot,
  );
  const hydrateFromWorkspaceSnapshot = useTabsStore(
    (state) => state.hydrateFromWorkspaceSnapshot,
  );
  const reset = useTabsStore((state) => state.reset);

  const activeTab: TabModel | null = useMemo(() => {
    if (!pane.activeTabId) return null;
    return tabs[pane.activeTabId] ?? null;
  }, [pane.activeTabId, tabs]);

  return {
    tabs,
    pane,
    activeTab,
    openInPreview,
    openPinned,
    activateTab,
    markTabDirty,
    setTabTitle,
    pinTab,
    unpinTab,
    togglePinTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    moveTabWithinPane,
    toWorkspaceSnapshot,
    hydrateFromWorkspaceSnapshot,
    reset,
  };
}
