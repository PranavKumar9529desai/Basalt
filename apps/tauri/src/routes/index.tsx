import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { useCallback, useEffect, useRef } from "react";
import { AppActivityBar } from "../app-shell/AppActivityBar";
import { AppSidebar } from "../app-shell/AppSidebar";
import { ThemeSelect } from "../app-shell/ThemeSelect";
import { AppCommands } from "../commands/app-commands";
import { useEditor } from "../features/editor/hooks/useEditor";
import { WorkspaceTabs } from "../features/tabs/components/WorkspaceTabs";
import { useTabPersistence } from "../features/tabs/hooks/useTabPersistence";
import { useTabs } from "../features/tabs/hooks/useTabs";
import { useTabsStore } from "../features/tabs/store";
import type { TabGroupId } from "../features/tabs/types";
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

  const editor = useEditor({ findNote });
  const tabs = useTabs();
  const syncSeqRef = useRef(0);
  const pendingLoadPathRef = useRef<string | null>(null);
  const tabDrivenSelectionRef = useRef<string | null>(null);
  const tabClickOpenBehavior = parseTabClickOpenBehavior(
    boot.settings?.tabClickOpenBehavior,
  );
  const {
    openInPreview,
    openPinned,
    setTabTitle,
    markTabDirty,
    setFocusedGroup,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    splitGroupWithTab,
  } = tabs;

  useTabPersistence({ workspace: boot.workspace });

  const focusedGroup = tabs.groups[tabs.focusedGroupId];
  const activeTab =
    focusedGroup?.activeTabId != null
      ? (tabs.tabs[focusedGroup.activeTabId] ?? null)
      : null;

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

  useEffect(() => {
    if (!editor.selected) return;
    if (activeTab && editor.selected.path !== activeTab.path) {
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] skip editor->tabs (stale selectedPath)", {
          seq: ++syncSeqRef.current,
          selectedPath: editor.selected.path,
          activePath: activeTab.path,
        });
      }
      return;
    }
    if (pendingLoadPathRef.current) {
      if (import.meta.env.DEV) {
        console.debug(
          "[tabs-sync] skip editor->tabs (tabs->editor in-flight)",
          {
            seq: ++syncSeqRef.current,
            selectedPath: editor.selected.path,
            pendingPath: pendingLoadPathRef.current,
          },
        );
      }
      return;
    }
    if (tabDrivenSelectionRef.current === editor.selected.path) {
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] skip editor->tabs (tab-driven selection)", {
          seq: ++syncSeqRef.current,
          path: editor.selected.path,
        });
      }
      tabDrivenSelectionRef.current = null;
      return;
    }
    if (activeTab?.path === editor.selected.path) {
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] skip editor->tabs (already active)", {
          seq: ++syncSeqRef.current,
          path: editor.selected.path,
        });
      }
      return;
    }
    if (import.meta.env.DEV) {
      console.debug("[tabs-sync] editor->tabs openInPreview", {
        seq: ++syncSeqRef.current,
        selectedPath: editor.selected.path,
        selectedName: editor.selected.name,
        activePath: activeTab?.path ?? null,
      });
    }
    const tabId = openInPreview({
      path: editor.selected.path,
      title: editor.selected.name,
    });
    setTabTitle(tabId, editor.selected.name);
  }, [activeTab?.path, editor.selected, openInPreview, setTabTitle]);

  useEffect(() => {
    if (!activeTab) return;
    if (editor.saveStatus === "saved") {
      markTabDirty(activeTab.id, false);
    }
  }, [activeTab, editor.saveStatus, markTabDirty]);

  const selectedPath = editor.selected?.path ?? null;

  useEffect(() => {
    if (!activeTab) return;

    if (selectedPath === activeTab.path) {
      pendingLoadPathRef.current = null;
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] skip tabs->editor (already selected)", {
          seq: ++syncSeqRef.current,
          path: activeTab.path,
        });
      }
      return;
    }

    if (pendingLoadPathRef.current === activeTab.path) {
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] skip tabs->editor (load in-flight)", {
          seq: ++syncSeqRef.current,
          pendingPath: pendingLoadPathRef.current,
        });
      }
      return;
    }

    pendingLoadPathRef.current = activeTab.path;
    tabDrivenSelectionRef.current = activeTab.path;
    if (selectedPath !== activeTab.path) {
      if (import.meta.env.DEV) {
        console.debug("[tabs-sync] tabs->editor loadNote", {
          seq: ++syncSeqRef.current,
          selectedPath,
          activePath: activeTab.path,
        });
      }
      void editor
        .loadNote({ name: activeTab.title, path: activeTab.path })
        .finally(() => {
          if (pendingLoadPathRef.current === activeTab.path) {
            pendingLoadPathRef.current = null;
          }
        });
    }
  }, [activeTab, selectedPath, editor.loadNote]);

  useEffect(() => {
    if (activeTab) return;
    pendingLoadPathRef.current = null;
    tabDrivenSelectionRef.current = null;
    if (!selectedPath) return;
    if (import.meta.env.DEV) {
      console.debug("[tabs-sync] tabs->editor closeNote (no active tab)", {
        seq: ++syncSeqRef.current,
        selectedPath,
      });
    }
    editor.closeNote();
  }, [activeTab, selectedPath, editor.closeNote]);

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
    if (!focusedGroup || !activeTab) return;
    closeTab(focusedGroup.id, activeTab.id, { force: true });
  }, [activeTab, closeTab, focusedGroup]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!focusedGroup || !activeTab) return;
    closeOtherTabs(focusedGroup.id, activeTab.id);
  }, [activeTab, closeOtherTabs, focusedGroup]);

  const handleCloseTabsToRight = useCallback(() => {
    if (!focusedGroup || !activeTab) return;
    closeTabsToRight(focusedGroup.id, activeTab.id);
  }, [activeTab, closeTabsToRight, focusedGroup]);

  const handleTogglePinActiveTab = useCallback(() => {
    if (!activeTab) return;
    togglePinTab(activeTab.id);
  }, [activeTab, togglePinTab]);

  const handleSplitRight = useCallback(() => {
    if (!focusedGroup || !activeTab) return;
    splitGroupWithTab(focusedGroup.id, "right", activeTab.id);
  }, [activeTab, focusedGroup, splitGroupWithTab]);

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
        hasActiveTab={Boolean(activeTab)}
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
        editor={editor}
        activeTab={activeTab}
        handleTabSelect={handleTabSelect}
        handleTabClose={handleTabClose}
        handleTabPinToggle={handleTabPinToggle}
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
