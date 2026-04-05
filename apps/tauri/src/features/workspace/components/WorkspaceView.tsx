import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityBar } from "../../../layout/ActivityBar";
import { Sidebar } from "../../../layout/Sidebar";
import { ThemeSelect } from "../../../layout/ThemeSelect";
import { AppCommands } from "./commands";
import { useEditorSessionsStore, usePaneManager } from "../../editor";
import { WorkspaceTabs, useTabPersistence, useTabs } from "../../tabs";
import { useWorkspaceTabHandlers } from "../hooks/useWorkspaceTabHandlers";
import { WorkspaceOverlays } from "./WorkspaceOverlays";
import { FileTree, VaultSplash, useVaultActions, useVaultTree } from "../../vault";
import { useWorkspaceSidebar } from "../hooks/useWorkspaceSidebar";
import type { BootResult, FlatTreeNode } from "../../vault";
import type { TabClickOpenBehavior } from "../../tabs";


// Tech Debut 
// i dont know what does
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

  const { controller, mutations, contextMenu, selection, handleConfirmDeleteWithTabs } =
    useWorkspaceSidebar({
      vaultPath,
      treeNodes,
      visibleNodes,
      openFolder,
      toggleFolder,
      refreshTree,
      editor: {
        focusedSessionSelected,
        focusedSessionTab,
        groups: tabs.groups,
        openInPreview,
        openPinned,
        setTabTitle,
        closeTab,
        tabClickOpenBehavior,
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

      <WorkspaceOverlays
        contextMenu={contextMenu}
        mutations={mutations}
        controller={controller}
        onConfirmDelete={handleConfirmDeleteWithTabs}
        onSearchOpen={handleSearchOpen}
      />
    </div>
  );
}
