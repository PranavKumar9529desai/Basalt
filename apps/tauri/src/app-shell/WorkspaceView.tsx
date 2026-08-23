/**
 * WorkspaceView — Pure workspace layout.
 *
 * Architecture: This component is responsible ONLY for composing the
 * visual layout of the workspace. Cross-feature state lives in
 * WorkspaceProvider (the "app context" views consume); views are
 * registered in viewRegistrations.ts and rendered by generic SideDocks
 * (ADR-018) — this file imports no feature panel directly.
 *
 * All initialization is owned by WorkspaceInit (parent). This component
 * receives boot as a prop solely to seed the provider and to gate the
 * first-run splash.
 */

import { commandService } from "@workspace/commands";
import { StripSeparator } from "@workspace/ui/components/top-strip";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { PaneContent } from "../features/editor";
import type { PaneRenderContext } from "../features/tabs";
import { useTabs, WorkspaceTabs, WorkspaceTabsBar } from "../features/tabs";
import type { BootResult } from "../features/vault";
import { useVaultActions, VaultSplash } from "../features/vault";
import "../shared/paneCommands";
import { ActivityBar } from "./ActivityBar";
import { useWorkspaceTabHandlers } from "./hooks/useWorkspaceTabHandlers";
import { SideDock } from "./SideDock";
import "./viewRegistrations";
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from "./WorkspaceProvider";
import { WorkspaceOverlays } from "./WorkspaceOverlays";

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  const vaultActions = useVaultActions();

  if (!boot.vault_path) {
    return (
      <VaultSplash
        isIndexing={vaultActions.isIndexing}
        status={vaultActions.status}
        onOpenVault={vaultActions.pickAndSetVault}
      />
    );
  }

  return (
    <WorkspaceProvider
      vaultPath={boot.vault_path}
      initialTree={boot.tree}
    >
      <WorkspaceShell
        defaultSidebarWidth={boot.workspace?.sidebarWidth as number | undefined}
      />
    </WorkspaceProvider>
  );
}

function WorkspaceShell({
  defaultSidebarWidth,
}: {
  defaultSidebarWidth?: number;
}) {
  const ws = useWorkspaceContext();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  const tabs = useTabs();
  const tabHandlers = useWorkspaceTabHandlers({
    tabActions: {
      activateTab: tabs.activateTab,
      closeTab: tabs.closeTab,
      closeOtherTabs: tabs.closeOtherTabs,
      closeTabsToRight: tabs.closeTabsToRight,
      togglePinTab: tabs.togglePinTab,
    },
    focusedSessionTab: ws.focusedSessionTab,
  });

  const renderPane = useCallback(
    (ctx: PaneRenderContext) => (
      <PaneContent
        activeTab={ctx.activeTab}
        findNote={ws.findNote}
        markTabDirty={ctx.markTabDirty}
      />
    ),
    [ws.findNote],
  );

  // Vault commands — need controller data from the context.
  useEffect(() => {
    commandService.registerCommand(
      "app:new-file",
      ws.controller.createNoteInstant,
    );
    commandService.registerCommand(
      "app:delete-file",
      ws.controller.handleDeleteFromCommands,
    );
    return () => {
      commandService.unregister("app:new-file");
      commandService.unregister("app:delete-file");
    };
  }, [ws.controller.createNoteInstant, ws.controller.handleDeleteFromCommands]);

  // Sidebar width persistence (debounced).
  const widthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSidebarWidthChange = useCallback((width: number) => {
    if (widthDebounceRef.current) clearTimeout(widthDebounceRef.current);
    widthDebounceRef.current = setTimeout(() => {
      invoke("set_workspace_key", { key: "sidebarWidth", value: width });
    }, 400);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/**
       * Workspace grid — the single authority for header-band geometry.
       * Row 1 is the 40px header band (ribbon top, dock headers, tab bar);
       * StripSeparator pins to its bottom edge and spans every header
       * column except the ribbon, whose vertical border runs through
       * unbroken. Columns span both rows so each owns its header +
       * content internally.
       */}
      <div className="grid flex-1 min-h-0 grid-cols-[auto_auto_1fr_auto] grid-rows-[40px_1fr]">
        <div className="col-start-1 row-span-full">
          <ActivityBar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            rightSidebarOpen={rightSidebarOpen}
            onToggleRightSidebar={() => setRightSidebarOpen((v) => !v)}
          />
        </div>

        <SideDock
          side="left"
          collapsed={!sidebarOpen}
          defaultWidth={defaultSidebarWidth}
          onWidthChange={handleSidebarWidthChange}
          className="col-start-2 row-span-full"
        />

        <div className="col-start-3 row-span-full flex min-h-0 min-w-0 flex-col">
          <WorkspaceTabsBar
            onSelectTab={tabHandlers.handleTabSelect}
            onCloseTab={tabHandlers.handleTabClose}
            onPinToggle={tabHandlers.handleTabPinToggle}
          />

          <WorkspaceTabs renderPane={renderPane} />
        </div>

        {/* The ONE bottom hairline under the header band. z-10: above the
            sections' opaque backgrounds, below the active tab + chrome nubs
            (z-20) which carve the cut-through. */}
        <StripSeparator className="col-start-2 col-end-[-1] row-start-1 self-end" />

        <SideDock
          side="right"
          collapsed={!rightSidebarOpen}
          onCollapse={() => setRightSidebarOpen(false)}
          className="col-start-4 row-span-full"
        />
      </div>

      <WorkspaceOverlays
        contextMenu={ws.contextMenu}
        mutations={ws.mutations}
        controller={ws.controller}
        onConfirmDelete={ws.handleConfirmDeleteWithTabs}
        onSearchOpen={ws.openNotePreview}
      />
    </div>
  );
}
