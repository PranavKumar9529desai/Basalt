import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Button } from "@workspace/ui/components/ui/button";
import { Editor } from "../../editor";
import { useTabDnD } from "../hooks/useTabDnD";
import { useTabs } from "../hooks/useTabs";
import type { TabGroupId } from "../types";
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
    editor: any;
    activeTab: any;
    handleTabSelect: (groupId: TabGroupId, tabId: string) => void;
    handleTabClose: (groupId: TabGroupId, tabId: string) => void;
    handleTabPinToggle: (tabId: string) => void;
}

export function WorkspaceTabs({
    editor,
    activeTab,
    handleTabSelect,
    handleTabClose,
    handleTabPinToggle,
}: WorkspaceTabsProps) {
    const tabs = useTabs();
    const tabDnD = useTabDnD();

    return (
        <div className="flex flex-1 min-h-0 bg-[var(--sat-surface-1)]">
            <div className="flex h-full w-full min-h-0">
                {tabs.orderedGroups.map((group, index) => {
                    const isFocused = group.id === tabs.focusedGroupId;
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

                    return (
                        <div
                            key={group.id}
                            className={`flex-1 min-w-0 ${index > 0 ? "border-l border-[var(--sat-layout-border)]" : ""}`}
                        >
                            <TabGroupFrame
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
                                        onPinToggle={handleTabPinToggle}
                                        onTabDragStart={(tabId, event) =>
                                            tabDnD.handleTabDragStart(group.id, tabId, event)
                                        }
                                        onTabDragOver={(_, event) =>
                                            tabDnD.handleTabDragOver(event)
                                        }
                                        onTabDrop={(tabId, event) =>
                                            tabDnD.handleTabDropOnTab(group.id, tabId, event)
                                        }
                                        onTabDragEnd={(_, event) => tabDnD.handleTabDragEnd(event)}
                                        rightSlot={
                                            isFocused ? (
                                                <SaveIndicator status={editor.saveStatus} />
                                            ) : undefined
                                        }
                                    />
                                }
                                className="h-full border-0"
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
                                                className="h-full"
                                                value={editor.content}
                                                onChange={(value) => {
                                                    if (activeTab) {
                                                        tabs.markTabDirty(activeTab.id, true);
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
                                        onActivate={() => tabs.setFocusedGroup(group.id)}
                                    />
                                )}
                            </TabGroupFrame>
                        </div>
                    );
                })}
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
