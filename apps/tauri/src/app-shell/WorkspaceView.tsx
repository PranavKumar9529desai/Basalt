import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useMemo, useState } from "react";
import { PaneContent, useFocusedPaneStore } from "../features/editor";
import { useSearchStore } from "../features/search";
import { initSettings, useSettingsStore } from "../features/settings";
import type { PaneRenderContext } from "../features/tabs";
import {
  getTabByPath,
  useTabPersistence,
  useTabs,
  WorkspaceTabs,
} from "../features/tabs";
import type { BootResult } from "../features/vault";
import {
  FileTree,
  findNoteByName,
  useVaultActions,
  useVaultTree,
  VaultSplash,
} from "../features/vault";
import { AppCommands } from "./AppCommands";
import { ActivityBar } from "./ActivityBar";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWorkspaceSidebar } from "./hooks/useWorkspaceSidebar";
import { useWorkspaceTabHandlers } from "./hooks/useWorkspaceTabHandlers";
import { RightSidebar } from "./RightSidebar";
import { Sidebar } from "./Sidebar";
import { WorkspaceOverlays } from "./WorkspaceOverlays";

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  initSettings(boot.settings);
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

  useTabPersistence({ workspace: boot.workspace });

  const openSearch = useSearchStore((s) => s.openSearch);
  const openSwitcher = useSearchStore((s) => s.openSwitcher);
  const openSettings = useSettingsStore((s) => s.open);

  useKeyboardShortcuts(
    {
      search: {
        key: "f",
        meta: true,
        handler: openSearch,
        preventDefault: true,
      },
      "quick-open": {
        key: "o",
        meta: true,
        handler: openSwitcher,
        preventDefault: true,
      },
      settings: {
        key: ",",
        meta: true,
        handler: openSettings,
        preventDefault: true,
      },
    },
    [openSearch, openSettings, openSwitcher],
  );

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
