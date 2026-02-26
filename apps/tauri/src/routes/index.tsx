import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect } from "react";
import { Editor } from "../features/editor";
import { AppSidebar } from "../app-shell/AppSidebar";
import { FileTree } from "../features/vault/components/FileTree";
import { SaveIndicator } from "../features/vault/components/SaveIndicator";
import { VaultSplash } from "../features/vault/components/VaultSplash";
import { useEditor } from "../features/editor/hooks/useEditor";
import { useVaultActions } from "../features/vault/hooks/useVaultActions";
import { useVaultTree } from "../features/vault/hooks/useVaultTree";
import { useVaultMutations } from "../features/vault/hooks/useVaultMutations";
import type { BootResult, FlatTreeNode } from "../features/vault/types";
import { AppActivityBar } from "../app-shell/AppActivityBar";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { AppCommands } from "../commands/app-commands";
import type { FileNode } from "@workspace/ui/components/file-tree";

interface LoaderData {
  boot: BootResult;
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

  const { treeNodes, visibleNodes, openFolders, toggleFolder, setTreeNodes } =
    useVaultTree(boot.tree);

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



  const handleCommitEdit = useCallback(
    async (node: FileNode, newName: string) => {
      mutations.clearGhost();
      if (node.isFolder) {
        await mutations.createFolder(newName);
        // Folder appears via watcher — no editor action needed
      } else {
        const result = await mutations.createNote(newName);
        if (result) {
          editor.loadNote({ name: result.name, path: result.path });
        }
      }
    },
    [mutations, editor],
  );

  const handleCancelEdit = useCallback(() => {
    mutations.clearGhost();
  }, [mutations]);

  // After deleting the current note, clear the editor
  const handleConfirmDelete = useCallback(async () => {
    const deleted = await mutations.confirmDelete();
    if (deleted && mutations.pendingDeletePath === editor.selected?.path) {
      editor.closeNote();
    }
  }, [mutations, editor]);

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
      <AppCommands
        onCreateNote={() => mutations.createNoteInline()}
        onDeleteNote={() => {
          if (editor.selected) {
            mutations.requestDelete(editor.selected.path, editor.selected.name);
          }
        }}
      />
      {/* Activity Bar */}
      <AppActivityBar />

      {/* ── Left sidebar: file tree ── */}
      <AppSidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        onCreateNote={() => mutations.createNoteInline()}
        onCreateFolder={() => mutations.createFolderInline()}
      >
        <FileTree
          visibleNodes={visibleNodes}
          openFolders={openFolders}
          selectedPath={editor.selected?.path ?? null}
          onFileClick={(node: FlatTreeNode) =>
            editor.loadNote({ name: node.name, path: node.path })
          }
          onFolderToggle={toggleFolder}
          ghostNode={mutations.ghostNode}
          onCommitEdit={handleCommitEdit}
          onCancelEdit={handleCancelEdit}
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
      <ConfirmDialog
        open={mutations.isDeleteConfirmOpen}
        onOpenChange={mutations.setDeleteConfirmOpen}
        title="Delete note"
        description={`Permanently delete "${mutations.pendingDeleteName}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}



interface ConflictBannerProps {
  onKeepMine: () => void;
  onDiscard: () => void;
}

function ConflictBanner({ onKeepMine, onDiscard }: ConflictBannerProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[color-mix(in srgb,var(--sat-state-danger) 18%,transparent)] border-b border-[var(--sat-state-danger)] text-sm text-[var(--sat-text-primary)] shrink-0">
      <span className="flex-1 text-xs leading-snug">
        File changed externally. Keep your edits or discard them?
      </span>
      <button
        type="button"
        onClick={onKeepMine}
        className="px-2.5 py-1 rounded bg-[var(--sat-state-danger)] hover:opacity-90 text-[var(--sat-text-inverse)] text-xs font-semibold transition-colors"
      >
        Keep mine
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="px-2.5 py-1 rounded bg-[var(--sat-surface-2)] hover:bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)] text-xs font-semibold transition-colors"
      >
        Discard
      </button>
    </div>
  );
}
