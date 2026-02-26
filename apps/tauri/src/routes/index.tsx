import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { TabGroupFrame, TabsBar } from "@workspace/ui/components/tabs";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect } from "react";
import { AppActivityBar } from "../app-shell/AppActivityBar";
import { AppSidebar } from "../app-shell/AppSidebar";
import { ThemeSelect } from "../app-shell/ThemeSelect";
import { AppCommands } from "../commands/app-commands";
import { Editor } from "../features/editor";
import { useEditor } from "../features/editor/hooks/useEditor";
import { useTabPersistence } from "../features/tabs/hooks/useTabPersistence";
import { useTabs } from "../features/tabs/hooks/useTabs";
import { useTabsStore } from "../features/tabs/store";
import type { TabGroupId } from "../features/tabs/types";
import { FileTree } from "../features/vault/components/FileTree";
import { SaveIndicator } from "../features/vault/components/SaveIndicator";
import { VaultSplash } from "../features/vault/components/VaultSplash";
import { useVaultActions } from "../features/vault/hooks/useVaultActions";
import { useVaultClipboard } from "../features/vault/hooks/useVaultClipboard";
import { useVaultContextMenu } from "../features/vault/hooks/useVaultContextMenu";
import { useVaultFileTreeController } from "../features/vault/hooks/useVaultFileTreeController";
import { useVaultMutations } from "../features/vault/hooks/useVaultMutations";
import { useVaultSelection } from "../features/vault/hooks/useVaultSelection";
import { useVaultTree } from "../features/vault/hooks/useVaultTree";
import type { BootResult, FlatTreeNode } from "../features/vault/types";

interface LoaderData {
  boot: BootResult;
}

interface ConflictBannerProps {
  onKeepMine: () => void;
  onDiscard: () => void;
}

interface InactiveGroupPaneProps {
  activeTitle: string | null;
  onActivate: () => void;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<LoaderData> => {
    const boot = await invoke<BootResult>("boot");
    return { boot };
  },

  pendingComponent: () => (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[var(--sat-text-muted)]">
      <div className="w-5 h-5 border-2 border-[var(--sat-text-muted)] border-t-[var(--sat-accent-primary)] rounded-full animate-spin" />
      <span className="text-sm text-[var(--sat-text-primary)]">
        Loading vault…
      </span>
    </div>
  ),

  component: RouteComponent,
});

function RouteComponent() {
  const { boot } = Route.useLoaderData();

  const vaultPath = boot.vault_path;

  const {
    treeNodes,
    visibleNodes,
    openFolders,
    toggleFolder,
    openFolder,
    refreshTree,
    setTreeNodes,
  } = useVaultTree(boot.tree);

  const vaultActions = useVaultActions();

  useEffect(() => {
    setTreeNodes(boot.tree);
  }, [boot.tree, setTreeNodes]);

  const findNote = useCallback(
    (name: string): FlatTreeNode | undefined =>
      treeNodes.find(
        (n) =>
          n.kind === "file" && (n.name === name || n.name === `${name}.md`),
      ),
    [treeNodes],
  );

  const editor = useEditor({ findNote });
  const tabs = useTabs();

  useTabPersistence({ workspace: boot.workspace });

  const focusedGroup = tabs.groups[tabs.focusedGroupId];
  const activeTab =
    focusedGroup?.activeTabId != null
      ? tabs.tabs[focusedGroup.activeTabId] ?? null
      : null;

  const syncActiveTabToEditor = useCallback(() => {
    const state = useTabsStore.getState();
    const group = state.groups[state.focusedGroupId];
    const tab = group?.activeTabId ? state.tabs[group.activeTabId] : null;
    if (!tab) {
      editor.closeNote();
      return;
    }
    if (editor.selected?.path !== tab.path) {
      void editor.loadNote({ name: tab.title, path: tab.path });
    }
  }, [editor]);

  const mutations = useVaultMutations();
  const selection = useVaultSelection();
  const clipboard = useVaultClipboard();
  const contextMenu = useVaultContextMenu();
  const controller = useVaultFileTreeController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor,
    mutations,
    selection,
    clipboard,
    contextMenu,
    openFolder,
    toggleFolder,
    refreshTree,
  });

  useEffect(() => {
    if (!editor.selected) return;
    const tabId = tabs.openInPreview({
      path: editor.selected.path,
      title: editor.selected.name,
    });
    tabs.setTabTitle(tabId, editor.selected.name);
  }, [editor.selected, tabs]);

  useEffect(() => {
    if (!activeTab) return;
    if (editor.saveStatus === "saved") {
      tabs.markTabDirty(activeTab.id, false);
    }
  }, [activeTab, editor.saveStatus, tabs]);

  useEffect(() => {
    if (!activeTab) {
      if (editor.selected) {
        editor.closeNote();
      }
      return;
    }
    if (editor.selected?.path !== activeTab.path) {
      void editor.loadNote({ name: activeTab.title, path: activeTab.path });
    }
  }, [activeTab, editor]);

  const handleTabSelect = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      tabs.setFocusedGroup(groupId);
      tabs.activateTab(groupId, tabId);
    },
    [tabs],
  );

  const handleTabClose = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      tabs.closeTab(groupId, tabId, { force: true });
      syncActiveTabToEditor();
    },
    [syncActiveTabToEditor, tabs],
  );

  const handleTabPinToggle = useCallback(
    (tabId: string) => {
      tabs.togglePinTab(tabId);
    },
    [tabs],
  );

  const handleConfirmDeleteWithTabs = useCallback(async () => {
    const deletedPaths = [...mutations.pendingDeletePaths];
    await controller.handleConfirmDelete();

    const state = useTabsStore.getState();
    for (const path of deletedPaths) {
      const tabId = `tab:${path}`;
      for (const group of Object.values(state.groups)) {
        if (group.tabIds.includes(tabId)) {
          state.closeTab(group.id, tabId, { force: true });
          break;
        }
      }
    }
    syncActiveTabToEditor();
  }, [controller, mutations.pendingDeletePaths, syncActiveTabToEditor]);

  if (!vaultPath) {
    return (
      <VaultSplash
        isIndexing={vaultActions.isIndexing}
        status={vaultActions.status}
        onOpenVault={vaultActions.pickAndSetVault}
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="absolute top-10 right-10 z-50 size-fit">
        <ThemeSelect />
      </div>
      <AppCommands
        onCreateNote={controller.startNoteInline}
        onDeleteNote={controller.handleDeleteFromCommands}
      />
      <AppActivityBar />

      <AppSidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        onCreateNote={controller.startNoteInline}
        onCreateFolder={controller.startFolderInline}
      >
        <FileTree
          visibleNodes={visibleNodes}
          openFolders={openFolders}
          selectedIds={selection.selectedIds}
          cutIds={controller.cutIds}
          onFileClick={controller.onTreeFileClick}
          onFolderToggle={controller.onTreeFolderToggle}
          onContextMenu={controller.onTreeContextMenu}
          onBackgroundContextMenu={controller.onTreeBackgroundContextMenu}
          ghostNode={mutations.ghostNode}
          onCommitEdit={controller.handleCommitEdit}
          onCancelEdit={controller.handleCancelEdit}
        />
      </AppSidebar>

      <div className="flex-1 min-h-0 bg-[var(--sat-surface-1)]">
        <div className="flex h-full min-h-0">
          {tabs.orderedGroups.map((group, index) => {
            const isFocused = group.id === tabs.focusedGroupId;
            const groupActiveTab =
              group.activeTabId != null ? tabs.tabs[group.activeTabId] ?? null : null;
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
                onMouseDown={() => tabs.setFocusedGroup(group.id)}
              >
                <TabGroupFrame
                  tabsBar={
                    <TabsBar
                      tabs={groupTabs}
                      onSelectTab={(tabId) => handleTabSelect(group.id, tabId)}
                      onCloseTab={(tabId) => handleTabClose(group.id, tabId)}
                      onPinToggle={handleTabPinToggle}
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

      <FileTreeContextMenu
        open={contextMenu.isOpen}
        anchor={contextMenu.menuState.anchor}
        targetKind={contextMenu.menuState.target?.kind ?? null}
        isMultiSelect={controller.isMultiSelectContextMenu}
        canPaste={controller.canPasteToMenuTarget}
        onOpenChange={(open) => {
          if (!open) contextMenu.closeMenu();
        }}
        onNewNote={controller.onMenuNewNote}
        onNewFolder={controller.onMenuNewFolder}
        onCut={controller.onMenuCut}
        onPaste={controller.onMenuPaste}
        onDelete={controller.onMenuDelete}
      />

      <ConfirmDialog
        open={mutations.isDeleteConfirmOpen}
        onOpenChange={mutations.setDeleteConfirmOpen}
        title={
          mutations.pendingDeletePaths.length > 1
            ? "Delete selected items"
            : "Delete note"
        }
        description={
          mutations.pendingDeletePaths.length > 1
            ? `Permanently delete ${mutations.pendingDeletePaths.length} selected items? This cannot be undone.`
            : `Permanently delete "${mutations.pendingDeleteName}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDeleteWithTabs}
        isLoading={mutations.isLoading}
      />
    </div>
  );
}

function InactiveGroupPane({ activeTitle, onActivate }: InactiveGroupPaneProps) {
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

function ConflictBanner({ onKeepMine, onDiscard }: ConflictBannerProps) {
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
