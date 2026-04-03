import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Button } from "@workspace/ui/components/ui/button";
import { Editor } from "../../editor";
import type { TabGroupModel } from "../types";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabs } from "../hooks/useTabs";
import type { ReactNode } from "react";
import type { TabGroupId, TabLayoutNode, TabModel } from "../types";
import type { UseEditorReturn } from "../../editor/hooks/useEditor";
import { SaveIndicator } from "../../vault/components/SaveIndicator";

interface ConflictBannerProps {
  onKeepMine: () => void;
  onDiscard: () => void;
}

interface InactiveGroupPaneProps {
  activeTitle: string | null;
  onActivate: () => void;
}

export interface WorkspaceTabsProps {
  editor?: UseEditorReturn;
  handleTabSelect: (groupId: TabGroupId, tabId: string) => void;
  handleTabClose: (groupId: TabGroupId, tabId: string) => void;
  handleTabPinToggle: (tabId: string) => void;
  renderGroupPane?: (context: WorkspaceTabsGroupRenderContext) => ReactNode;
}

export interface WorkspaceTabsGroupRenderContext {
  groupId: TabGroupId;
  group: TabGroupModel;
  groupTabs: {
    id: string;
    title: string;
    isActive: boolean;
    isDirty: boolean;
    isPinned: boolean;
    isPreview: boolean;
    canClose: boolean;
  }[];
  activeTab: TabModel | null;
  isFocused: boolean;
  tabDnD: ReturnType<typeof useTabDnD>;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  onActivateGroup: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinToggle: (tabId: string) => void;
}

export function WorkspaceTabs({
  editor,
  handleTabSelect,
  handleTabClose,
  handleTabPinToggle,
  renderGroupPane,
}: WorkspaceTabsProps) {
  const tabs = useTabs();
  const tabDnD = useTabDnD();
  const layoutRoot = tabs.layoutRoot;
  const fallbackGroupId = tabs.focusedGroupId ?? tabs.groupOrder[0] ?? "";
  const rootNode: TabLayoutNode = layoutRoot ?? {
    type: "group",
    groupId: fallbackGroupId,
  };

  const renderDefaultGroupPane = (context: WorkspaceTabsGroupRenderContext) => {
    if (!editor) {
      return null;
    }
    const {
      group,
      groupTabs,
      isFocused,
      activeTab: groupActiveTab,
      tabDnD: contextTabDnD,
      markTabDirty: contextMarkTabDirty,
      onActivateGroup,
      onSelectTab,
      onCloseTab,
      onPinToggle,
    } = context;

    return (
      <TabGroupFrame
        key={group.id}
        showSplitTargets={contextTabDnD.isDraggingTab}
        activeSplitTarget={contextTabDnD.getSplitTargetDirection(group.id)}
        onSplitTargetDragEnter={(direction, event) =>
          contextTabDnD.handleSplitTargetDragEnter(group.id, direction, event)
        }
        onSplitTargetDragOver={(direction, event) =>
          contextTabDnD.handleSplitTargetDragOver(group.id, direction, event)
        }
        onSplitTargetDragLeave={(direction) =>
          contextTabDnD.handleSplitTargetDragLeave(group.id, direction)
        }
        onSplitTargetDrop={(direction, event) =>
          contextTabDnD.handleSplitTargetDrop(group.id, direction, event)
        }
        tabsBar={
          <TabsBar
            tabs={groupTabs}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onPinToggle={onPinToggle}
            onTabDragStart={(tabId, event) =>
              contextTabDnD.handleTabDragStart(group.id, tabId, event)
            }
            onTabDragOver={(_, event) => contextTabDnD.handleTabDragOver(event)}
            onTabDrop={(tabId, event) =>
              contextTabDnD.handleTabDropOnTab(group.id, tabId, event)
            }
            onTabDragEnd={(_, event) => contextTabDnD.handleTabDragEnd(event)}
            rightSlot={
              isFocused ? (
                <SaveIndicator status={editor.saveStatus} />
              ) : undefined
            }
          />
        }
        className="flex-1 min-h-0 border-0"
      >
        {isFocused ? (
          <>
            {editor.saveStatus === "conflict" && (
              <ConflictBanner
                onKeepMine={editor.performSave}
                onDiscard={editor.discardAndReload}
              />
            )}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Editor
                className="flex-1 min-h-0"
                value={editor.content}
                onChange={(value) => {
                  if (groupActiveTab) {
                    contextMarkTabDirty(groupActiveTab.id, true);
                  }
                  editor.handleChange(value);
                }}
                initialContent=""
                onFetchLinks={editor.onFetchLinks}
                onFetchTags={editor.onFetchTags}
                onOpenLink={editor.handleOpenLink}
                onSearch={(query) => {
                  console.log("Searching for:", query);
                }}
              />
            </div>
          </>
        ) : (
          <InactiveGroupPane
            activeTitle={groupActiveTab?.title ?? null}
            onActivate={onActivateGroup}
          />
        )}
      </TabGroupFrame>
    );
  };

  const renderPaneForGroup = (
    context: WorkspaceTabsGroupRenderContext,
  ): ReactNode => {
    if (renderGroupPane) {
      return renderGroupPane(context);
    }
    return renderDefaultGroupPane(context);
  };

  const renderLayoutNode = (node: TabLayoutNode): ReactNode => {
    if (node.type === "group") {
      const group = tabs.groups[node.groupId];
      if (!group) {
        return null;
      }

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
      const context: WorkspaceTabsGroupRenderContext = {
        groupId: group.id,
        group,
        groupTabs,
        activeTab: groupActiveTab,
        isFocused: group.id === tabs.focusedGroupId,
        tabDnD,
        markTabDirty: tabs.markTabDirty,
        onActivateGroup: () => tabs.setFocusedGroup(group.id),
        onSelectTab: (tabId) => handleTabSelect(group.id, tabId),
        onCloseTab: (tabId) => handleTabClose(group.id, tabId),
        onPinToggle: (tabId) => handleTabPinToggle(tabId),
      };
      return renderPaneForGroup(context);
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

export function InactiveGroupPane({
  activeTitle,
  onActivate,
}: InactiveGroupPaneProps) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--sat-surface-2)] px-6 text-center">
      <Button
        type="button"
        onClick={onActivate}
        variant="outline"
        className="border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)]"
      >
        {activeTitle
          ? `Activate pane to edit: ${activeTitle}`
          : "Activate pane to edit"}
      </Button>
    </div>
  );
}

export function ConflictBanner({ onKeepMine, onDiscard }: ConflictBannerProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <Button
        type="button"
        size="xs"
        onClick={onKeepMine}
        className="bg-[var(--sat-state-danger)] text-[var(--sat-text-inverse)] hover:opacity-90 border-transparent"
      >
        Keep mine
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onDiscard}
        className="bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
      >
        Discard
      </Button>
    </div>
  );
}
