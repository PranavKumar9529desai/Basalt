import { useCallback, useEffect, useRef } from "react";
import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Editor } from "../../features/editor";
import { useEditor } from "../../features/editor/hooks/useEditor";
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
            <PaneInstance key={context.groupId} context={context} findNote={findNote} />
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

    useEffect(() => {
        if (!activeTab) {
            lastLoadedPathRef.current = null;
            void editor.closeNote();
            return;
        }

        const path = activeTab.path;
        if (lastLoadedPathRef.current === path) {
            return;
        }
        lastLoadedPathRef.current = path;
        void editor.loadNote({ name: activeTab.title, path });
    }, [activeTab, editor]);

    const handleEditorChange = useCallback(
        (value: string) => {
            if (activeTab) {
                markTabDirty(activeTab.id, true);
            }
            editor.handleChange(value);
        },
        [activeTab, markTabDirty, editor],
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
                    onTabDrop={(tabId, event) => handleTabDropOnTab(group.id, tabId, event)}
                    onTabDragEnd={(_, event) => handleTabDragEnd(event)}
                    rightSlot={
                        activeTab ? (
                            <SaveIndicator status={editor.saveStatus} />
                        ) : undefined
                    }
                />
            }
            className="h-full border-0"
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
                        className="flex-1 min-h-0 overflow-hidden"
                        onMouseDown={handlePanePointerDown}
                    >
                        <Editor
                            className="h-full"
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
                <InactiveGroupPane
                    activeTitle={activeTab?.title ?? null}
                    onActivate={onActivateGroup}
                />
            )}
        </TabGroupFrame>
    );
}
