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
import { leafRegistry, LeafServicesProvider } from "@workspace/views";
import { HeaderBandRule } from "@workspace/ui/components/header-band";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PaneRenderContext } from "../features/tabs";
import {
  useTabs,
  useTabsStore,
  WorkspaceTabs,
  WorkspaceTabsBar,
} from "../features/tabs";
import type { BootResult } from "../features/vault";
import { useVaultMutations, VaultSplash } from "../features/vault";
import "../shared/tabCommands";
import { Ribbon } from "./Ribbon";
import { useWorkspaceTabHandlers } from "./hooks/useWorkspaceTabHandlers";
import { SideDock } from "./SideDock";
import "./viewRegistrations";
import { WorkspaceProvider, useWorkspaceContext } from "./WorkspaceProvider";
import { WorkspaceOverlays } from "./WorkspaceOverlays";

interface WorkspaceViewProps {
  boot: BootResult;
}

export function WorkspaceView({ boot }: WorkspaceViewProps) {
  const { isIndexing, status, pickAndSetVault } = useVaultMutations();

  if (!boot.vault_path) {
    return (
      <VaultSplash
        isIndexing={isIndexing}
        status={status}
        onOpenVault={pickAndSetVault}
      />
    );
  }

  return (
    <WorkspaceProvider vaultPath={boot.vault_path} initialTree={boot.tree}>
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
      togglePinTab: tabs.togglePinTab,
    },
  });

  // Stable services bag for leaf components — identity must not change per
  // render, or every keystroke would re-render the active leaf.
  const getOpenTabIds = useCallback(
    () => new Set(Object.keys(useTabsStore.getState().tabs)),
    [],
  );

  const getOpenTabPaths = useCallback(
    () =>
      new Set(Object.values(useTabsStore.getState().tabs).map((t) => t.path)),
    [],
  );

  const getTabInfo = useCallback(
    (tabId: string) => useTabsStore.getState().tabs[tabId] ?? null,
    [],
  );

  // Structural-tab-mutation signal: persistVersion bumps only on open/close/
  // pin/rename, so leaves can prune per-tab caches without re-rendering.
  const onTabStructureChanged = useCallback((cb: () => void) => {
    let last = useTabsStore.getState().persistVersion;
    return useTabsStore.subscribe((s) => {
      if (s.persistVersion !== last) {
        last = s.persistVersion;
        cb();
      }
    });
  }, []);

  const leafServices = useMemo(
    () => ({
      openNote: ws.openNote,
      markTabDirty: tabs.markTabDirty,
      findNote: ws.findNote,
      getOpenTabIds,
      getOpenTabPaths,
      getTabInfo,
      onTabStructureChanged,
    }),
    [
      ws.openNote,
      tabs.markTabDirty,
      ws.findNote,
      getOpenTabIds,
      getOpenTabPaths,
      getTabInfo,
      onTabStructureChanged,
    ],
  );

  const renderPane = useCallback(
    (ctx: PaneRenderContext) => {
      const tab = ctx.activeTab;
      if (!tab) return null;

      // ADR-018 Phase 2: leaf content resolves from the registry by the
      // tab's leafType — never a component switch statement here.
      const leaf =
        leafRegistry.get(tab.leafType) ?? leafRegistry.get("markdown");
      if (!leaf) return null;
      const LeafComponent = leaf.component;

      return (
        <LeafServicesProvider services={leafServices}>
          <LeafComponent tab={tab} />
        </LeafServicesProvider>
      );
    },
    [leafServices],
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
      // Persisted width is best-effort; a failed write must not surface UI errors.
      void invoke("set_workspace_key", { key: "sidebarWidth", value: width });
    }, 400);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/**
       * Workspace grid — the single authority for header-band geometry.
       * Row 1 is the 40px header band (ribbon top, dock headers, tab bar);
       * HeaderBandRule pins to its bottom edge and spans every header
       * column except the ribbon, whose vertical border runs through
       * unbroken. Columns span both rows so each owns its header +
       * content internally.
       */}
      <div className="grid flex-1 min-h-0 grid-cols-[auto_auto_1fr_auto] grid-rows-[40px_1fr]">
        <div className="col-start-1 row-span-full">
          <Ribbon
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
        <HeaderBandRule className="col-start-2 col-end-[-1] row-start-1 self-end" />

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
        onSearchOpen={ws.openNote}
      />
    </div>
  );
}
