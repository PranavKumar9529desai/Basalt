/**
 * Shell — Pure workspace layout.
 *
 * Architecture: This component is responsible ONLY for composing the
 * visual layout of the workspace. Cross-feature state lives in
 * AppProvider (the "app context" views consume); views are
 * registered in registrations.ts and rendered by generic SideDocks
 * (ADR-018) — this file imports no feature panel directly.
 *
 * All initialization is owned by Boot (parent). This component
 * receives boot as a prop solely to seed the provider and to gate the
 * first-run splash.
 */

import { leafRegistry, LeafServicesProvider } from "@workspace/views";
import { HeaderBandRule } from "@workspace/ui/components/header-band";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState, Suspense } from "react";

import type { PaneRenderContext } from "../features/tabs";
import { useTabsStore, Tabs, TabsBar } from "../features/tabs";
import type { BootResult } from "../features/vault";
import { useVaultMutations, VaultSplash } from "../features/vault";
import "../shared/tabCommands";
import { Ribbon } from "./Ribbon";
import { SideDock } from "./SideDock";
import { ViewHeader } from "./ViewHeader";
import "./registrations";
import { AppProvider, useAppContext } from "./AppProvider";
import { Overlays } from "./Overlays";
import { useLeafServices } from "./useLeafServices";
import { useShellCommands } from "./useShellCommands";

interface ShellProps {
  boot: BootResult;
}

export function Shell({ boot }: ShellProps) {
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
    <AppProvider vaultPath={boot.vault_path} initialTree={boot.tree}>
      <WorkspaceShell
        defaultSidebarWidth={boot.workspace?.sidebarWidth as number | undefined}
      />
    </AppProvider>
  );
}

function WorkspaceShell({
  defaultSidebarWidth,
}: {
  defaultSidebarWidth?: number;
}) {
  const ws = useAppContext();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  const activateTab = useTabsStore((s) => s.activateTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const togglePinTab = useTabsStore((s) => s.togglePinTab);
  const handleTabSelect = useCallback(
    (tabId: string) => activateTab(tabId),
    [activateTab],
  );
  const handleTabClose = useCallback(
    (tabId: string) => closeTab(tabId, { force: true }),
    [closeTab],
  );
  const handleTabPinToggle = togglePinTab;

  useShellCommands(ws);
  const leafServices = useLeafServices(ws);

  const renderPane = useCallback(
    (ctx: PaneRenderContext) => {
      const tab = ctx.activeTab;
      if (!tab) return null;

      const leaf =
        leafRegistry.get(tab.leafType) ?? leafRegistry.get("markdown");
      if (!leaf) return null;
      const LeafComponent = leaf.component;

      return (
        <div className="flex h-full min-h-0 flex-col">
          <ViewHeader
            tab={tab}
            vaultPath={ws.vaultPath}
            canRename={leaf.type === "markdown"}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <LeafServicesProvider services={leafServices}>
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-[var(--sat-text-muted)] text-xs">
                    Loading…
                  </div>
                }
              >
                <LeafComponent tab={tab} />
              </Suspense>
            </LeafServicesProvider>
          </div>
        </div>
      );
    },
    [leafServices, ws.vaultPath],
  );

  const widthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSidebarWidthChange = useCallback((width: number) => {
    if (widthDebounceRef.current) clearTimeout(widthDebounceRef.current);
    widthDebounceRef.current = setTimeout(() => {
      void invoke("set_workspace_key", { key: "sidebarWidth", value: width });
    }, 400);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
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
          <TabsBar
            onSelectTab={handleTabSelect}
            onCloseTab={handleTabClose}
            onPinToggle={handleTabPinToggle}
          />

          <Tabs renderPane={renderPane} />
        </div>

        <HeaderBandRule className="col-start-2 col-end-[-1] row-start-1 self-end" />

        <SideDock
          side="right"
          collapsed={!rightSidebarOpen}
          onCollapse={() => setRightSidebarOpen(false)}
          className="col-start-4 row-span-full"
        />
      </div>

      <Overlays
        contextMenu={ws.contextMenu}
        mutations={ws.mutations}
        controller={ws.controller}
        onConfirmDelete={ws.handleConfirmDeleteWithTabs}
        onSearchOpen={ws.openNote}
      />
    </div>
  );
}
