import { TabsBar } from "@workspace/ui/components/tabs";
import { type DragEvent, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabsStore } from "../store";

export interface WorkspaceTabsBarProps {
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinToggle: (tabId: string) => void;
}

// WorkspaceTabsBar — store→view wiring for the editor tab bar. Rendered by
// the shell as the header cell of the editor column in the workspace grid.
// The bottom hairline is owned by the shell's <HeaderBandRule>, not drawn here.
export function WorkspaceTabsBar({
  onSelectTab,
  onCloseTab,
  onPinToggle,
}: WorkspaceTabsBarProps) {
  // Project only the data each pill needs; useShallow compares the array
  // shallowly, so a mutation to any single tab (dirty/title/pin) or the active
  // selection re-renders only when the rendered pills actually change — not on
  // every tabs/pane identity churn.
  const tabsBarTabs = useTabsStore(
    useShallow((s) =>
      s.pane.tabIds
        .map((tabId) => s.tabs[tabId])
        .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          isActive: s.pane.activeTabId === tab.id,
          isDirty: tab.isDirty,
          isPinned: tab.isPinned,
          isPreview: tab.isPreview,
          canClose: true,
        })),
    ),
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
    <TabsBar
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
