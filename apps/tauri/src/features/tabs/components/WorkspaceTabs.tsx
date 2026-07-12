import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { type DragEvent, type ReactNode, useCallback, useMemo } from "react";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabsStore } from "../store";
import type {
  TabGroupId,
  TabLayoutNode,
  TabLayoutSplitNode,
  TabModel,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaneRenderContext {
  groupId: TabGroupId;
  activeTab: TabModel | null;
  isFocused: boolean;
  markTabDirty: (tabId: string, dirty: boolean) => void;
  onActivateGroup: () => void;
}

export interface WorkspaceTabsProps {
  handleTabSelect: (groupId: TabGroupId, tabId: string) => void;
  handleTabClose: (groupId: TabGroupId, tabId: string) => void;
  handleTabPinToggle: (tabId: string) => void;
  renderPane: (context: PaneRenderContext) => ReactNode;
  tabBarLeftSlot?: ReactNode;
  tabBarRightSlot?: ReactNode;
}

// ---------------------------------------------------------------------------
// WorkspaceTabs — renders layout tree + tab bars, delegates content to renderPane
// ---------------------------------------------------------------------------

// --------------------------------------------------------------------------
// TabGroupPane — reads from tabs store directly to avoid re-render cascade
// when tabs in other groups change.
// --------------------------------------------------------------------------

interface TabGroupPaneProps {
  groupId: TabGroupId;
  tabDnD: ReturnType<typeof useTabDnD>;
  handleTabSelect: (groupId: TabGroupId, tabId: string) => void;
  handleTabClose: (groupId: TabGroupId, tabId: string) => void;
  handleTabPinToggle: (tabId: string) => void;
  renderPane: (context: PaneRenderContext) => ReactNode;
  tabBarLeftSlot?: ReactNode;
  tabBarRightSlot?: ReactNode;
}

function TabGroupPane({
  groupId,
  tabDnD,
  handleTabSelect,
  handleTabClose,
  handleTabPinToggle,
  renderPane,
  tabBarLeftSlot,
  tabBarRightSlot,
}: TabGroupPaneProps) {
  // Subscribe to only the data this group needs — avoids re-rendering when
  // tabs in OTHER groups change.
  const group = useTabsStore((state) => state.groups[groupId]);
  const tabsRecord = useTabsStore((state) => state.tabs);
  const focusedGroupId = useTabsStore((state) => state.focusedGroupId);
  const setFocusedGroup = useTabsStore((state) => state.setFocusedGroup);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);

  // Bail out early if group was removed (shouldn't happen under normal
  // operation, but guards against race conditions during split/merge).
  if (!group) return null;

  const isFocused = group.id === focusedGroupId;

  const onActivateGroup = useCallback(
    () => setFocusedGroup(group.id),
    [group.id, setFocusedGroup],
  );

  const tabIds = group.tabIds;
  const activeTabId = group.activeTabId;

  // groupTabs recomputes when THIS group's tabIds, activeTabId, or tab
  // metadata (e.g. isDirty) change.  We read tabsRecord from the store
  // subscription instead of getState() so that markTabDirty updates the
  // dirty indicator immediately.
  const groupTabs = useMemo(() => {
    return tabIds
      .map((tabId) => tabsRecord[tabId])
      .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))
      .map((tab) => ({
        id: tab.id,
        title: tab.title,
        isActive: activeTabId === tab.id,
        isDirty: tab.isDirty,
        isPinned: tab.isPinned,
        isPreview: tab.isPreview,
        canClose: true,
      }));
  }, [tabIds, activeTabId, tabsRecord]);

  // groupActiveTab recomputes only when THIS group's activeTabId changes.
  // this is all tech debt once i need sit and understand this corretly
  const groupActiveTab = useMemo(() => {
    if (!activeTabId) return null;
    const { tabs } = useTabsStore.getState();
    return tabs[activeTabId] ?? null;
  }, [activeTabId]);

  // Stabilise per-group event handlers so that the tabsBar useMemo only
  // recomputes when groupTabs or presentation props change, not every time
  // the parent re-renders.
  const handleGroupTabSelect = useCallback(
    (tabId: string) => handleTabSelect(group.id, tabId),
    [group.id, handleTabSelect],
  );
  const handleGroupTabClose = useCallback(
    (tabId: string) => handleTabClose(group.id, tabId),
    [group.id, handleTabClose],
  );
  const handleGroupTabPinToggle = useCallback(
    (tabId: string) => handleTabPinToggle(tabId),
    [handleTabPinToggle],
  );
  const handleGroupTabDragStart = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragStart(group.id, tabId, event),
    [group.id, tabDnD.handleTabDragStart],
  );
  const handleGroupTabDragOver = useCallback(
    (_: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragOver(event),
    [tabDnD.handleTabDragOver],
  );
  const handleGroupTabDrop = useCallback(
    (tabId: string, event: DragEvent<HTMLElement>, edge: "left" | "right") =>
      tabDnD.handleTabDropOnTab(group.id, tabId, event, edge),
    [group.id, tabDnD.handleTabDropOnTab],
  );
  const handleGroupTabDragEnd = useCallback(
    (_: string, event: DragEvent<HTMLElement>) =>
      tabDnD.handleTabDragEnd(event),
    [tabDnD.handleTabDragEnd],
  );

  const tabsBar = useMemo(
    () => (
      <TabsBar
        tabs={groupTabs}
        onSelectTab={handleGroupTabSelect}
        onCloseTab={handleGroupTabClose}
        onPinToggle={handleGroupTabPinToggle}
        onTabDragStart={handleGroupTabDragStart}
        onTabDragOver={handleGroupTabDragOver}
        onTabDrop={handleGroupTabDrop}
        onTabDragEnd={handleGroupTabDragEnd}
        leftSlot={isFocused ? tabBarLeftSlot : undefined}
        rightSlot={isFocused ? tabBarRightSlot : undefined}
      />
    ),
    [
      groupTabs,
      handleGroupTabSelect,
      handleGroupTabClose,
      handleGroupTabPinToggle,
      handleGroupTabDragStart,
      handleGroupTabDragOver,
      handleGroupTabDrop,
      handleGroupTabDragEnd,
      isFocused,
      tabBarLeftSlot,
      tabBarRightSlot,
    ],
  );

  return (
    <TabGroupFrame
      key={group.id}
      showSplitTargets={tabDnD.isDraggingTab}
      activeSplitTarget={tabDnD.getSplitTargetDirection(group.id)}
      onSplitTargetDragEnter={(direction, event) =>
        tabDnD.handleSplitTargetDragEnter(group.id, direction, event)
      }
      onSplitTargetDragOver={(direction, event) =>
        tabDnD.handleSplitTargetDragOver(group.id, direction, event)
      }
      onSplitTargetDragLeave={(direction) =>
        tabDnD.handleSplitTargetDragLeave(group.id, direction)
      }
      onSplitTargetDrop={(direction, event) =>
        tabDnD.handleSplitTargetDrop(group.id, direction, event)
      }
      tabsBar={tabsBar}
      className="flex-1 min-h-0 border-0"
    >
      {renderPane({
        groupId: group.id,
        activeTab: groupActiveTab,
        isFocused,
        markTabDirty,
        onActivateGroup,
      })}
    </TabGroupFrame>
  );
}

// -------------------------------------------------------------------------
// SplitLayoutNode — renders a split container (no hooks, just layout)
// -------------------------------------------------------------------------

function SplitLayoutNode({
  node,
  renderLayoutNodeFn,
}: {
  node: TabLayoutSplitNode;
  renderLayoutNodeFn: (n: TabLayoutNode) => ReactNode;
}) {
  const isRow = node.axis === "row";
  return (
    <div
      className={`flex flex-1 min-h-0 w-full ${isRow ? "flex-row" : "flex-col"}`}
    >
      {node.children.map((child, index) => {
        const hasBorder = index > 0;
        const borderClass = hasBorder
          ? `${isRow ? "border-l" : "border-t"} border-[var(--sat-layout-border)]`
          : "";
        return (
          <div
            key={
              child.type === "group" ? child.groupId : `${child.axis}-${index}`
            }
            className={`flex flex-1 min-h-0 min-w-0 ${
              isRow ? "min-w-0" : "w-full"
            } ${borderClass}`}
          >
            {renderLayoutNodeFn(child)}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------
// WorkspaceTabs
// -------------------------------------------------------------------------

export function WorkspaceTabs({
  handleTabSelect,
  handleTabClose,
  handleTabPinToggle,
  renderPane,
  tabBarLeftSlot,
  tabBarRightSlot,
}: WorkspaceTabsProps) {
  const layoutRoot = useTabsStore((state) => state.layoutRoot);
  const focusedGroupId = useTabsStore((state) => state.focusedGroupId);
  const groupOrder = useTabsStore((state) => state.groupOrder);
  const tabDnD = useTabDnD();

  const fallbackGroupId = focusedGroupId ?? groupOrder[0] ?? "";
  const rootNode: TabLayoutNode = layoutRoot ?? {
    type: "group",
    groupId: fallbackGroupId,
  };

  const renderLayoutNode = useCallback(
    (node: TabLayoutNode): ReactNode => {
      if (node.type === "group") {
        return (
          <TabGroupPane
            key={node.groupId}
            groupId={node.groupId}
            tabDnD={tabDnD}
            handleTabSelect={handleTabSelect}
            handleTabClose={handleTabClose}
            handleTabPinToggle={handleTabPinToggle}
            renderPane={renderPane}
            tabBarLeftSlot={tabBarLeftSlot}
            tabBarRightSlot={tabBarRightSlot}
          />
        );
      }
      return (
        <SplitLayoutNode
          key={`${node.axis}`}
          node={node}
          renderLayoutNodeFn={renderLayoutNode}
        />
      );
    },
    [
      tabDnD,
      handleTabSelect,
      handleTabClose,
      handleTabPinToggle,
      renderPane,
      tabBarLeftSlot,
      tabBarRightSlot,
    ],
  );

  return (
    <div className="flex flex-1 min-h-0 bg-[var(--sat-surface-1)]">
      <div className="flex flex-1 min-h-0 w-full min-w-0">
        {renderLayoutNode(rootNode)}
      </div>
    </div>
  );
}
