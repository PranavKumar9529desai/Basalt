import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import type { ReactNode } from "react";
import type { TabGroupId, TabLayoutNode, TabModel } from "../types";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabs } from "../hooks/useTabs";

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

  const renderLayoutNode = (node: TabLayoutNode): ReactNode => {
    if (node.type === "group") {
      const group = tabs.groups[node.groupId];
      if (!group) return null;

      const groupActiveTab =
        group.activeTabId != null
          ? (tabs.tabs[group.activeTabId] ?? null)
          : null;

      const groupTabs = group.tabIds
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
        }));

      const isFocused = group.id === tabs.focusedGroupId;
      const onActivateGroup = () => tabs.setFocusedGroup(group.id);

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
          tabsBar={
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
          }
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
              {renderLayoutNode(child)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-1 min-h-0 bg-[var(--sat-surface-1)]">
      <div className="flex flex-1 min-h-0 w-full min-w-0">
        {renderLayoutNode(rootNode)}
      </div>
    </div>
  );
}
