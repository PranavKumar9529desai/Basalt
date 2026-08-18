/**
 * WorkspaceView — Pure workspace layout.
 *
 * Architecture: This component is responsible ONLY for composing the visual
 * layout of the workspace. It reads feature state from Zustand stores via
 * hooks (useTabs, useVaultTree, useFocusedPaneStore) — it does NOT perform
 * any initialization or persistence.
 *
 * All initialization is owned by WorkspaceInit (parent). This component
 * receives boot as a prop solely to seed useVaultTree(boot.tree) — the
 * boot object is never stored in a Zustand store.
 *
 * Cross-feature wiring (vault ↔ tabs ↔ editor) happens here via shell
 * hooks (useWorkspaceSidebar, useWorkspaceTabHandlers) — this is the
 * ONLY place where features are composed together.
 *
 * Command registration for vault actions (app:new-file, app:delete-file)
 * lives here because those commands depend on `controller` from
 * useWorkspaceSidebar — runtime hook data, not boot seed data.
 */
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useCommandStore } from "@workspace/commands";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PaneContent, useFocusedPaneStore } from "../features/editor";
import type { PaneRenderContext } from "../features/tabs";
import { getTabByPath, useTabs, WorkspaceTabs } from "../features/tabs";
import type { BootResult } from "../features/vault";
import {
  FileTree,
  findNoteByName,
  useVaultActions,
  useVaultTree,
  VaultSplash,
} from "../features/vault";
import { ActivityBar } from "./ActivityBar";
import { useWorkspaceSidebar } from "./hooks/useWorkspaceSidebar";
import { useWorkspaceTabHandlers } from "./hooks/useWorkspaceTabHandlers";
import { RightSidebar } from "./RightSidebar";
import { Sidebar } from "./Sidebar";
import { WorkspaceOverlays } from "./WorkspaceOverlays";

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  const vaultPath = boot.vault_path;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  const {
    treeNodes,
    visibleNodes,
    openFolders,
    toggleFolder,
    openFolder,
    refreshTree,
  } = useVaultTree(boot.tree);

  const vaultActions = useVaultActions();

  const findNote = useCallback(
    (name: string) => findNoteByName(treeNodes, name),
    [treeNodes],
  );

  const tabs = useTabs();

  const focusedSessionSelected = useFocusedPaneStore(
    (state) => state.focusedPaneSelected,
  );
  const focusedSessionTab = useMemo(
    () =>
      focusedSessionSelected?.path
        ? getTabByPath(tabs.groups, tabs.tabs, focusedSessionSelected.path)
        : null,
    [focusedSessionSelected?.path, tabs.groups, tabs.tabs],
  );

  const {
    controller,
    mutations,
    contextMenu,
    selection,
    handleConfirmDeleteWithTabs,
  } = useWorkspaceSidebar({
    vaultPath,
    treeNodes,
    visibleNodes,
    openFolder,
    toggleFolder,
    refreshTree,
    editor: {
      focusedSessionSelected,
      focusedSessionTab,
      openInPreview: tabs.openInPreview,
      openPinned: tabs.openPinned,
      setTabTitle: tabs.setTabTitle,
      closeTab: tabs.closeTab,
    },
  });

  const tabHandlers = useWorkspaceTabHandlers({
    tabActions: {
      activateTab: tabs.activateTab,
      closeTab: tabs.closeTab,
      closeOtherTabs: tabs.closeOtherTabs,
      closeTabsToRight: tabs.closeTabsToRight,
      togglePinTab: tabs.togglePinTab,
      splitGroupWithTab: tabs.splitGroupWithTab,
      setFocusedGroup: tabs.setFocusedGroup,
    },
    focusedSessionTab,
  });

  const renderPane = useCallback(
    (ctx: PaneRenderContext) => (
      <PaneContent
        activeTab={ctx.activeTab}
        isFocused={ctx.isFocused}
        findNote={findNote}
        markTabDirty={ctx.markTabDirty}
        onActivateGroup={ctx.onActivateGroup}
      />
    ),
    [findNote],
  );

  const handleSearchOpen = useCallback(
    (path: string) => {
      const node = treeNodes.find((n) => n.kind === "file" && n.path === path);
      if (node) {
        const tabId = tabs.openInPreview({ path: node.path, title: node.name });
        tabs.setTabTitle(tabId, node.name);
      }
    },
    [treeNodes, tabs.openInPreview, tabs.setTabTitle],
  );

  // Vault commands — need hook data, so registered here in the shell.
  useEffect(() => {
    const { registerCommand, unregister } = useCommandStore.getState();
    registerCommand("app:new-file", controller.createNoteInstant);
    registerCommand("app:delete-file", controller.handleDeleteFromCommands);
    return () => {
      unregister("app:new-file");
      unregister("app:delete-file");
    };
  }, [controller.createNoteInstant, controller.handleDeleteFromCommands]);

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
      <ActivityBar
        leftSidebarOpen={sidebarOpen}
        onToggleLeftSidebar={() => setSidebarOpen((v) => !v)}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={() => setRightSidebarOpen((v) => !v)}
      />

      <Sidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        collapsed={!sidebarOpen}
        onCreateNote={controller.createNoteInstant}
        onCreateFolder={controller.startFolderInline}
        onCollapse={() => setSidebarOpen(false)}
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
        renderPane={renderPane}
        tabBarLeftSlot={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <IconLayoutSidebarLeftCollapse size={20} stroke={1.5} />
            ) : (
              <IconLayoutSidebarLeftExpand size={20} stroke={1.5} />
            )}
          </Button>
        }
      />

      <RightSidebar
        open={rightSidebarOpen}
        onOpenChange={setRightSidebarOpen}
        onOpenNote={handleSearchOpen}
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
