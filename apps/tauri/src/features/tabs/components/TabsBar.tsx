import { TabsBar as UITabsBar } from "@workspace/ui/components/tabs";
import { type DragEvent, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabsStore } from "../store";
import { findLeaf } from "../lib/layoutTree";

export interface TabsBarProps {
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinToggle: (tabId: string) => void;
}

// TabsBar — store→view wiring for the editor tab bar. Rendered by
// the shell as the header cell of the editor column in the workspace grid.
// The bottom hairline is owned by the shell's <HeaderBandRule>, not drawn here.
export function TabsBar({
  onSelectTab,
  onCloseTab,
  onPinToggle,
}: TabsBarProps) {
  // Project only the data each pill needs. The selector picks STABLE
  // references — the active leaf's `tabIds` array, the `tabs` map, and its
  // active id — so useShallow's shallow compare short-circuits and the
  // snapshot only changes when a render-affecting change actually lands.
  // Building the tab array (or pill shape) here would allocate a fresh array
  // per selector call, defeating useSyncExternalStore's snapshot caching and
  // causing an infinite render loop ("Maximum depth reached"). The tab
  // reference list is derived below in a useMemo instead.
  const { tabIds, tabsRef, activeTabId } = useTabsStore(
    useShallow((s) => {
      const leaf = findLeaf(s.root, s.activePaneId);
      return {
        tabIds: leaf?.tabGroup.tabIds ?? [],
        tabsRef: s.tabs,
        activeTabId: leaf?.tabGroup.activeTabId ?? null,
      };
    }),
  );
  const tabRefs = useMemo(
    () =>
      tabIds
        .map((tabId) => tabsRef[tabId])
        .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab)),
    [tabIds, tabsRef],
  );
  const tabsBarTabs = useMemo(
    () =>
      tabRefs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        isActive: activeTabId === tab.id,
        isDirty: tab.isDirty,
        isPinned: tab.isPinned,
        isPreview: tab.isPreview,
        canClose: true,
      })),
    [tabRefs, activeTabId],
  );
  const tabDnD = useTabDnD();

  const onSelect = useCallback(
    (tabId: string) => onSelectTab(tabId),
    [onSelectTab],
  );
  const onClose = useCallback(
    (tabId: string) => onCloseTab(tabId),
    [onCloseTab],
  );
  const onPin = useCallback(
    (tabId: string) => onPinToggle(tabId),
    [onPinToggle],
  );
  const onTabDragStart = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragStart(tabId, event),
    [tabDnD],
  );
  const onTabDragOver = useCallback(
    (_: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragOver(event),
    [tabDnD],
  );
  const onTabDrop = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>, edge: "left" | "right") =>
      tabDnD.handleTabDropOnTab(tabId, event, edge),
    [tabDnD],
  );
  const onTabDragEnd = useCallback(
    (_: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragEnd(event),
    [tabDnD],
  );

  return (
    <UITabsBar
      className="min-w-0 shrink-0"
      tabs={tabsBarTabs}
      onSelectTab={onSelect}
      onCloseTab={onClose}
      onPinToggle={onPin}
      onTabDragStart={onTabDragStart}
      onTabDragOver={onTabDragOver}
      onTabDrop={onTabDrop}
      onTabDragEnd={onTabDragEnd}
    />
  );
}
