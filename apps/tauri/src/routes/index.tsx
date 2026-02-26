import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { Button } from "@workspace/ui/components/ui/button";
import { useCallback, useEffect } from "react";
import { AppActivityBar } from "../app-shell/AppActivityBar";
import { AppSidebar } from "../app-shell/AppSidebar";
import { ThemeSelect } from "../app-shell/ThemeSelect";
import { AppCommands } from "../commands/app-commands";
import { Editor } from "../features/editor";
import { useEditor } from "../features/editor/hooks/useEditor";
import { FileTree } from "../features/vault/components/FileTree";
import { SaveIndicator } from "../features/vault/components/SaveIndicator";
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

interface ConflictBannerProps {
  onKeepMine: () => void;
  onDiscard: () => void;
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

  // When the loader re-runs (after vault change / reindex) sync the tree.
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
  });

  // ── No-vault splash ───────────────────────────────────────────────────────

  if (!vaultPath) {
    return (
      <VaultSplash
        isIndexing={vaultActions.isIndexing}
        status={vaultActions.status}
        onOpenVault={vaultActions.pickAndSetVault}
      />
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0">
      <div className="absolute top-10 right-10 z-50 size-fit">
        <ThemeSelect />
      </div>
      <AppCommands
        onCreateNote={controller.startNoteInline}
        onDeleteNote={controller.handleDeleteFromCommands}
      />
      {/* Activity Bar */}
      <AppActivityBar />

      {/* ── Left sidebar: file tree ── */}
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

      {/* ── Centre: editor ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-[var(--sat-surface-1)]">
        {/* Editor header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--sat-layout-border)] shrink-0 bg-[var(--sat-surface-1)]">
          <span className="text-sm text-[var(--sat-text-primary)] flex-1 truncate">
            {editor.selected ? editor.selected.name : "No note selected"}
          </span>
          <SaveIndicator status={editor.saveStatus} />
        </div>

        {/* Conflict banner */}
        {editor.saveStatus === "conflict" && (
          <ConflictBanner
            onKeepMine={editor.performSave}
            onDiscard={editor.discardAndReload}
          />
        )}

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Editor
            className="h-full"
            value={editor.content}
            onChange={editor.handleChange}
            initialContent=""
            onFetchLinks={editor.onFetchLinks}
            onFetchTags={editor.onFetchTags}
            onOpenLink={editor.handleOpenLink}
            onSearch={(query) => {
              console.log("Searching for:", query);
            }}
          />
        </div>
      </div>

      {/* ── Delete confirmation dialog ── */}
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
        onConfirm={controller.handleConfirmDelete}
        isLoading={mutations.isLoading}
      />
    </div>
  );
}

function ConflictBanner({ onKeepMine, onDiscard }: ConflictBannerProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <Button
        type="button"
        size="xs"
        onClick={onKeepMine}
        className="bg-[var(--sat-state-danger)] text-[var(--sat-text-inverse)] hover:opacity-90 border-transparent"
      >
        Keep mine
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onDiscard}
        className="bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
      >
        Discard
      </Button>
    </div>
  );
}
