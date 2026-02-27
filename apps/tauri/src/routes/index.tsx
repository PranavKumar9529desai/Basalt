import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { useCallback, useEffect, useMemo } from "react";
import { AppActivityBar } from "../app-shell/AppActivityBar";
import { AppSidebar } from "../app-shell/AppSidebar";
import { ThemeSelect } from "../app-shell/ThemeSelect";
import { AppCommands } from "../commands/app-commands";
import { useEditorSessionsStore } from "../features/editor/store";
import { WorkspaceTabs } from "../features/tabs/components/WorkspaceTabs";
import { useTabPersistence } from "../features/tabs/hooks/useTabPersistence";
import { useTabs } from "../features/tabs/hooks/useTabs";
import { useTabsStore } from "../features/tabs/store";
import type { TabGroupId } from "../features/tabs/types";
import { usePaneManager } from "../app-shell/panes/usePaneManager";
import { FileTree } from "../features/vault/components/FileTree";
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

type TabClickOpenBehavior = "preview" | "pinned" | "vscode";

function parseTabClickOpenBehavior(value: unknown): TabClickOpenBehavior {
  if (value === "preview" || value === "pinned" || value === "vscode") {
    return value;
  }
  return "vscode";
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

  const { renderGroupPane } = usePaneManager({ findNote });
  const tabs = useTabs();
  const tabClickOpenBehavior = parseTabClickOpenBehavior(
    boot.settings?.tabClickOpenBehavior,
  );
  const {
    openInPreview,
    openPinned,
    setTabTitle,
    setFocusedGroup,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
  } = tabs;

  useTabPersistence({ workspace: boot.workspace });

  const focusedSessionSelected = useEditorSessionsStore(
    (state) => state.sessions[tabs.focusedGroupId]?.selected ?? null,
  );
  const focusedSessionTab = useMemo(() => {
    const path = focusedSessionSelected?.path;
    if (!path) return null;
    const tabId = `tab:${path}`;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tabId)) {
        return tabs.tabs[tabId] ?? null;
      }
    }
    return null;
  }, [focusedSessionSelected?.path, tabs.groups, tabs.tabs]);

  const mutations = useVaultMutations();
  const selection = useVaultSelection();
  const clipboard = useVaultClipboard();
  const contextMenu = useVaultContextMenu();
  const controller = useVaultFileTreeController({
    treeNodes,
    visibleNodes,
    vaultPath,
    editor: {
      selected: focusedSessionSelected,
      loadNote: (note) => {
        const tabId = openInPreview({ path: note.path, title: note.name });
        setTabTitle(tabId, note.name);
      },
      closeNote: () => {
        const tab = focusedSessionTab;
        if (!tab) return;
        for (const group of Object.values(tabs.groups)) {
          if (group.tabIds.includes(tab.id)) {
            closeTab(group.id, tab.id, { force: true });
            break;
          }
        }
      },
    },
    mutations,
    selection,
    clipboard,
    contextMenu,
    openFolder,
    toggleFolder,
    refreshTree,
    onFileOpen: (node, mode) => {
      const effectiveMode =
        tabClickOpenBehavior === "vscode" ? mode : tabClickOpenBehavior;
      const tabId =
        effectiveMode === "pinned"
          ? openPinned({ path: node.path, title: node.name })
          : openInPreview({ path: node.path, title: node.name });
      setTabTitle(tabId, node.name);
    },
  });

  const handleTabSelect = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      setFocusedGroup(groupId);
      activateTab(groupId, tabId);
    },
    [activateTab, setFocusedGroup],
  );

  const handleTabClose = useCallback(
    (groupId: TabGroupId, tabId: string) => {
      closeTab(groupId, tabId, { force: true });
    },
    [closeTab],
  );

  const handleTabPinToggle = useCallback(
    (tabId: string) => {
      togglePinTab(tabId);
    },
    [togglePinTab],
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
  }, [controller, mutations.pendingDeletePaths]);

  const handleCloseActiveTab = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeTab(group.id, tab.id, { force: true });
        break;
      }
    }
  }, [closeTab, focusedSessionTab, tabs.groups]);

  const handleCloseOtherTabs = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeOtherTabs(group.id, tab.id);
        break;
      }
    }
  }, [closeOtherTabs, focusedSessionTab, tabs.groups]);

  const handleCloseTabsToRight = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        closeTabsToRight(group.id, tab.id);
        break;
      }
    }
  }, [closeTabsToRight, focusedSessionTab, tabs.groups]);

  const handleTogglePinActiveTab = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    togglePinTab(tab.id);
  }, [focusedSessionTab, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "right", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitLeft = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "left", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitUp = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "top", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

  const handleSplitDown = useCallback(() => {
    const tab = focusedSessionTab;
    if (!tab) return;
    for (const group of Object.values(tabs.groups)) {
      if (group.tabIds.includes(tab.id)) {
        splitGroupWithTab(group.id, "bottom", tab.id);
        break;
      }
    }
  }, [focusedSessionTab, splitGroupWithTab, tabs.groups]);

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
        onCloseActiveTab={handleCloseActiveTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseTabsToRight={handleCloseTabsToRight}
        onTogglePinActiveTab={handleTogglePinActiveTab}
        onSplitRight={handleSplitRight}
        onSplitLeft={handleSplitLeft}
        onSplitTop={handleSplitUp}
        onSplitBottom={handleSplitDown}
        hasActiveTab={Boolean(focusedSessionTab)}
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

      <WorkspaceTabs
        handleTabSelect={handleTabSelect}
        handleTabClose={handleTabClose}
        handleTabPinToggle={handleTabPinToggle}
        renderGroupPane={renderGroupPane}
      />

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
