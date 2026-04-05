import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "./Sidebar";
import { ThemeSelect } from "./ThemeSelect";
import { AppCommands } from "./commands";
import { useEditorSessionsStore } from "../features/editor/store";
import { usePaneManager } from "../features/editor/PaneInstance";
import { QuickSwitcher, SearchModal } from "../features/search";
import { SettingsModal } from "../features/settings";
import { WorkspaceTabs } from "../features/tabs/components/WorkspaceTabs";
import { useTabPersistence } from "../features/tabs/hooks/useTabPersistence";
import { useTabs } from "../features/tabs/hooks/useTabs";
import { useTabsStore } from "../features/tabs/store";
import { useWorkspaceTabHandlers } from "./useWorkspaceTabHandlers";
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

type TabClickOpenBehavior = "preview" | "pinned" | "vscode";

function parseTabClickOpenBehavior(value: unknown): TabClickOpenBehavior {
  if (value === "preview" || value === "pinned" || value === "vscode") {
    return value;
  }
  return "vscode";
}

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  const vaultPath = boot.vault_path;
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const tabHandlers = useWorkspaceTabHandlers({
    tabActions: {
      groups: tabs.groups,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      togglePinTab,
      splitGroupWithTab,
      setFocusedGroup,
    },
    focusedSessionTab,
  });

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

  const handleSearchOpen = useCallback(
    (path: string) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      if (node) {
        const tabId = openInPreview({ path: node.path, title: node.name });
        setTabTitle(tabId, node.name);
      }
    },
    [treeNodes, openInPreview, setTabTitle],
  );

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
        onCreateNote={controller.createNoteInstant}
        onDeleteNote={controller.handleDeleteFromCommands}
        onCloseActiveTab={tabHandlers.handleCloseActiveTab}
        onCloseOtherTabs={tabHandlers.handleCloseOtherTabs}
        onCloseTabsToRight={tabHandlers.handleCloseTabsToRight}
        onTogglePinActiveTab={tabHandlers.handleTogglePinActiveTab}
        onSplitRight={tabHandlers.handleSplitRight}
        onSplitLeft={tabHandlers.handleSplitLeft}
        onSplitTop={tabHandlers.handleSplitUp}
        onSplitBottom={tabHandlers.handleSplitDown}
        hasActiveTab={Boolean(focusedSessionTab)}
      />
      <ActivityBar />

      <Sidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        collapsed={!sidebarOpen}
        onCreateNote={controller.createNoteInstant}
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
      </Sidebar>

      <WorkspaceTabs
        handleTabSelect={tabHandlers.handleTabSelect}
        handleTabClose={tabHandlers.handleTabClose}
        handleTabPinToggle={tabHandlers.handleTabPinToggle}
        renderGroupPane={renderGroupPane}
        tabBarLeftSlot={
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1 pb-2 rounded text-[var(--sat-accent-primary)] hover:bg-[var(--sat-surface-3)] transition-colors "
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen
              ? <IconLayoutSidebarLeftCollapse size={20} stroke={1.5} />
              : <IconLayoutSidebarLeftExpand size={20} stroke={1.5} />}
          </button>
        }
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

      <SearchModal onOpen={handleSearchOpen} />
      <QuickSwitcher onOpen={handleSearchOpen} />
      <SettingsModal />
    </div>
  );
}
