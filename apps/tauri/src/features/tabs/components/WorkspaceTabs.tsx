import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { useCallback, useMemo, type ReactNode } from "react";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabs } from "../hooks/useTabs";
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
// TabGroupPane — extracted component so hooks are called at top level
// --------------------------------------------------------------------------

interface TabGroupPaneProps {
  groupId: TabGroupId;
  tabs: ReturnType<typeof useTabs>;
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
  tabs,
  tabDnD,
  handleTabSelect,
  handleTabClose,
  handleTabPinToggle,
  renderPane,
  tabBarLeftSlot,
  tabBarRightSlot,
}: TabGroupPaneProps) {
  const group = tabs.groups[groupId];

  const groupActiveTab = useMemo(
    () =>
      group.activeTabId != null
        ? (tabs.tabs[group.activeTabId] ?? null)
        : null,
    [group.activeTabId, tabs.tabs],
  );

  const groupTabs = useMemo(
    () =>
      group.tabIds
        .map((tabId) => tabs.tabs[tabId])
        .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          isActive: group.activeTabId === tab.id,
          isDirty: tab.isDirty,
          isPinned: tab.isPinned,
          isPreview: tab.isPreview,
          canClose: true,
        })),
    [group.tabIds, group.activeTabId, tabs.tabs],
  );

  const isFocused = group.id === tabs.focusedGroupId;

  const onActivateGroup = useCallback(
    () => tabs.setFocusedGroup(group.id),
    [group.id, tabs.setFocusedGroup],
  );

  const tabsBar = useMemo(
    () => (
      <TabsBar
        tabs={groupTabs}
        onSelectTab={(tabId) => handleTabSelect(group.id, tabId)}
        onCloseTab={(tabId) => handleTabClose(group.id, tabId)}
        onPinToggle={(tabId) => handleTabPinToggle(tabId)}
        onTabDragStart={(tabId, event) =>
          tabDnD.handleTabDragStart(group.id, tabId, event)
        }
        onTabDragOver={(_, event) => tabDnD.handleTabDragOver(event)}
        onTabDrop={(tabId, event, edge) =>
          tabDnD.handleTabDropOnTab(group.id, tabId, event, edge)
        }
        onTabDragEnd={(_, event) => tabDnD.handleTabDragEnd(event)}
        leftSlot={isFocused ? tabBarLeftSlot : undefined}
        rightSlot={isFocused ? tabBarRightSlot : undefined}
      />
    ),
    [
      groupTabs,
      group.id,
      handleTabSelect,
      handleTabClose,
      handleTabPinToggle,
      tabDnD,
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
        markTabDirty: tabs.markTabDirty,
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
              child.type === "group"
                ? child.groupId
                : `${child.axis}-${index}`
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
  const tabs = useTabs();
  const tabDnD = useTabDnD();
  const layoutRoot = tabs.layoutRoot;
  const fallbackGroupId = tabs.focusedGroupId ?? tabs.groupOrder[0] ?? "";
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
            tabs={tabs}
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
      tabs,
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
