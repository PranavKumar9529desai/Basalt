import { useCallback, useEffect, useRef } from "react";
import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Editor } from "../../features/editor";
import { useEditor } from "../../features/editor/hooks/useEditor";
import { useEditorSessionsStore } from "../../features/editor/store";
import {
  ConflictBanner,
  InactiveGroupPane,
  type WorkspaceTabsGroupRenderContext,
} from "../../features/tabs/components/WorkspaceTabs";
import { SaveIndicator } from "../../features/vault/components/SaveIndicator";
import type { FlatTreeNode } from "../../features/vault/types";

export interface PaneManagerOptions {
  findNote: (name: string) => FlatTreeNode | undefined;
}

export function usePaneManager({ findNote }: PaneManagerOptions) {
  const renderGroupPane = useCallback(
    (context: WorkspaceTabsGroupRenderContext) => (
      <PaneInstance
        key={context.groupId}
        context={context}
        findNote={findNote}
      />
    ),
    [findNote],
  );

  return { renderGroupPane };
}

interface PaneInstanceProps {
  context: WorkspaceTabsGroupRenderContext;
  findNote: (name: string) => FlatTreeNode | undefined;
}

function PaneInstance({ context, findNote }: PaneInstanceProps) {
  const {
    group,
    groupTabs,
    activeTab,
    tabDnD,
    markTabDirty,
    onActivateGroup,
    onSelectTab,
    onCloseTab,
    onPinToggle,
  } = context;

  if (!group) {
    return null;
  }

  const editor = useEditor({ findNote });
  const lastLoadedPathRef = useRef<string | null>(null);
  const ensureSession = useEditorSessionsStore((state) => state.ensureSession);
  const updateSession = useEditorSessionsStore((state) => state.updateSession);
  const removeSession = useEditorSessionsStore((state) => state.removeSession);

  useEffect(() => {
    ensureSession(group.id);
    return () => {
      removeSession(group.id);
    };
  }, [ensureSession, group.id, removeSession]);

  useEffect(() => {
    updateSession(group.id, {
      selected: editor.selected,
      content: editor.content,
      backlinks: editor.backlinks,
      saveStatus: editor.saveStatus,
      status: editor.status,
    });
  }, [
    editor.backlinks,
    editor.content,
    editor.saveStatus,
    editor.selected,
    editor.status,
    group.id,
    updateSession,
  ]);

  useEffect(() => {
    if (!activeTab) {
      lastLoadedPathRef.current = null;
      editor.closeNote();
      return;
    }

    const path = activeTab.path;
    if (lastLoadedPathRef.current === path) {
      return;
    }
    lastLoadedPathRef.current = path;
    void editor.loadNote({ name: activeTab.title, path });
  }, [activeTab?.path, activeTab?.title, editor.closeNote, editor.loadNote]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeTab) {
        markTabDirty(activeTab.id, true);
      }
      editor.handleChange(value);
    },
    [activeTab, markTabDirty, editor.handleChange],
  );

  const handlePanePointerDown = useCallback(() => {
    onActivateGroup();
  }, [onActivateGroup]);

  const {
    isDraggingTab,
    getSplitTargetDirection,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDropOnTab,
    handleTabDragEnd,
    handleSplitTargetDragEnter,
    handleSplitTargetDragOver,
    handleSplitTargetDragLeave,
    handleSplitTargetDrop,
  } = tabDnD;

  return (
    <TabGroupFrame
      key={group.id}
      showSplitTargets={isDraggingTab}
      activeSplitTarget={getSplitTargetDirection(group.id)}
      onSplitTargetDragEnter={(direction, event) =>
        handleSplitTargetDragEnter(group.id, direction, event)
      }
      onSplitTargetDragOver={(direction, event) =>
        handleSplitTargetDragOver(group.id, direction, event)
      }
      onSplitTargetDragLeave={(direction) =>
        handleSplitTargetDragLeave(group.id, direction)
      }
      onSplitTargetDrop={(direction, event) =>
        handleSplitTargetDrop(group.id, direction, event)
      }
      tabsBar={
        <TabsBar
          tabs={groupTabs}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onPinToggle={onPinToggle}
          onTabDragStart={(tabId, event) =>
            handleTabDragStart(group.id, tabId, event)
          }
          onTabDragOver={(_, event) => handleTabDragOver(event)}
          onTabDrop={(tabId, event) =>
            handleTabDropOnTab(group.id, tabId, event)
          }
          onTabDragEnd={(_, event) => handleTabDragEnd(event)}
          rightSlot={
            activeTab ? <SaveIndicator status={editor.saveStatus} /> : undefined
          }
        />
      }
      className="flex-1 min-h-0 border-0"
    >
      {activeTab ? (
        <>
          {editor.saveStatus === "conflict" && (
            <ConflictBanner
              onKeepMine={editor.performSave}
              onDiscard={editor.discardAndReload}
            />
          )}
          <div
            className="flex flex-1  flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--sat-layout-divider)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--sat-layout-divider)_70%,transparent)] hover:[&::-webkit-scrollbar-thumb]:bg-[var(--sat-layout-divider)]"
            onPointerDownCapture={handlePanePointerDown}
          >
            <Editor
              className="flex-1 min-h-0"
              value={editor.content}
              onChange={handleEditorChange}
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
        <InactiveGroupPane activeTitle={null} onActivate={onActivateGroup} />
      )}
    </TabGroupFrame>
  );
}
