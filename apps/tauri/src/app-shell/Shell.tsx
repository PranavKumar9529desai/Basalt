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
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";

import { useTabsStore, TabsBar, PaneRenderer, type LeafRenderContext } from "../features/tabs";
import { parseFrontmatter } from "../features/editor";
import type { BootResult } from "../features/vault";
import { useVaultMutations, VaultSplash } from "../features/vault";
import type { PreviewDeps } from "../features/search";
import "../shared/tabCommands";
import "../shared/editorCommands";
import { startEditorContextSync } from "../shared/activeEditor";
import "../features/export/commands";
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
  const { openNote, findNote } = ws;

  // Derive keybinding contexts (editorFocused) from the active-editor
  // authority — single owner, so pane churn can't leave stale flags.
  useEffect(() => startEditorContextSync(), []);

  // Reading-mode deps for the search preview, composed where editor + vault
  // services coexist. See features/search/types.ts (PreviewDeps) — ADR-029
  // full reading-mode parity. `parseFrontmatter` is a stable module fn and the
  // rest are stable callbacks, so the bag identity is stable across renders.
  const previewDeps = useMemo<PreviewDeps>(
    () => ({
      parseFrontmatter,
      runQuery: (dql: string) =>
        invoke<import("@workspace/editor").QueryResult>("run_query", {
          dql,
          path: "",
        }),
      resolveAsset: leafServices.resolveAsset ?? (() => null),
      onOpenLink: (name: string) => {
        const target = findNote(name) ?? findNote(`${name}.md`);
        if (target) openNote(target.path);
      },
    }),
    [leafServices.resolveAsset, findNote, openNote],
  );

  const renderLeaf = useCallback(
    (ctx: LeafRenderContext) => {
      const tab = ctx.activeTabId
        ? useTabsStore.getState().tabs[ctx.activeTabId]
        : null;
      if (!tab) return null;

      const leaf =
        leafRegistry.get(tab.leafType) ?? leafRegistry.get("markdown");
      if (!leaf) return null;
      const LeafComponent = leaf.component;

      return (
        <div className="flex h-full min-h-0 flex-col">
          <TabsBar
            paneId={ctx.paneId}
            onSelectTab={handleTabSelect}
            onCloseTab={handleTabClose}
            onPinToggle={handleTabPinToggle}
          />
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
                <LeafComponent tab={tab} paneId={ctx.paneId} />
              </Suspense>
            </LeafServicesProvider>
          </div>
        </div>
      );
    },
    [
      leafServices,
      ws.vaultPath,
      handleTabSelect,
      handleTabClose,
      handleTabPinToggle,
    ],
  );

  const root = useTabsStore((s) => s.root);

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
          <PaneRenderer node={root} renderLeaf={renderLeaf} />
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
        previewDeps={previewDeps}
      />
    </div>
  );
}
