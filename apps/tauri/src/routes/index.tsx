import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import type { FileNode } from "@workspace/ui/components/file-tree";
import { FileTreeContextMenu } from "@workspace/ui/components/file-tree";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const [focusedNode, setFocusedNode] = useState<FlatTreeNode | null>(null);

  const selectedNode = useMemo(
    () => treeNodes.find((n) => n.path === editor.selected?.path),
    [treeNodes, editor.selected],
  );

  const deriveParentContext = useCallback(
    (target?: FlatTreeNode) => {
      const node = target ?? focusedNode ?? selectedNode;
      if (!node) return { parentRelPath: "", depth: 0 };

      const isFolder = node.kind === "folder";
      const parentRelPath = isFolder
        ? node.relPath
        : (() => {
            const lastSlash = node.relPath.lastIndexOf("/");
            return lastSlash === -1 ? "" : node.relPath.slice(0, lastSlash);
          })();

      const parentDepth = isFolder ? node.depth : Math.max(0, node.depth - 1);
      const depth = parentDepth + 1;
      return { parentRelPath, depth };
    },
    [focusedNode, selectedNode],
  );

  const deriveParentContextFromMenuTarget = useCallback(() => {
    const target = contextMenu.menuState.target;
    if (!target) return { parentRelPath: "", depth: 0 };
    if (target.kind === "root" || !target.node) {
      return { parentRelPath: "", depth: 0 };
    }
    return deriveParentContext(target.node);
  }, [contextMenu.menuState.target, deriveParentContext]);

  const startNoteInline = useCallback(() => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    mutations.createNoteInline(ctx);
  }, [deriveParentContext, mutations, openFolder]);

  const startFolderInline = useCallback(() => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    mutations.createFolderInline(ctx);
  }, [deriveParentContext, mutations, openFolder]);

  const cutIds = useMemo(
    () => new Set(clipboard.clipboard.items.map((item) => item.path)),
    [clipboard.clipboard.items],
  );

  const canPasteToMenuTarget = useMemo(() => {
    if (!clipboard.hasItems) return false;
    const target = contextMenu.menuState.target;
    if (!target) return false;
    if (target.kind === "file") return false;

    const destinationPath =
      target.kind === "folder" ? (target.node?.path ?? null) : null;
    if (!destinationPath) return true;

    return clipboard.clipboard.items.every((item) => {
      if (item.path === destinationPath) return false;
      if (item.isFolder && destinationPath.startsWith(`${item.path}/`)) {
        return false;
      }
      return true;
    });
  }, [
    clipboard.clipboard.items,
    clipboard.hasItems,
    contextMenu.menuState.target,
  ]);

  // Helper to parse VS Code–style input with slashes and trailing "/"
  const parseInlineName = useCallback(
    (raw: string, baseParent: string | undefined) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;

      const isFolder = trimmed.endsWith("/");
      const withoutTrailing = trimmed.replace(/[\\/]+$/, "");
      if (!withoutTrailing) return null;

      const segments = withoutTrailing.split("/").filter(Boolean);
      const leaf = segments.pop();
      if (!leaf) return null;

      const parentSegments = segments;
      if (baseParent) {
        parentSegments.unshift(...baseParent.split("/").filter(Boolean));
      }

      const parentRelPath = parentSegments.join("/");
      return {
        leaf,
        parentRelPath,
        isFolder,
      };
    },
    [],
  );

  const handleCommitEdit = useCallback(
    async (node: FileNode & { parentRelPath?: string }, newName: string) => {
      mutations.clearGhost();

      const parsed = parseInlineName(newName, node.parentRelPath);
      if (!parsed) return;

      const { leaf, parentRelPath, isFolder } = parsed;

      if (isFolder || node.isFolder) {
        const folderPath = await mutations.createFolder(leaf, parentRelPath);
        if (folderPath && vaultPath) {
          const prefix = `${vaultPath}/`;
          const relPath = folderPath.startsWith(prefix)
            ? folderPath.slice(prefix.length)
            : folderPath;
          if (relPath) {
            openFolder(relPath);
          }
        }
        await refreshTree();
      } else {
        const result = await mutations.createNote(
          leaf,
          parentRelPath || undefined,
        );
        if (result) {
          editor.loadNote({ name: result.name, path: result.path });
        }
        if (parentRelPath) {
          openFolder(parentRelPath);
        }
        await refreshTree();
      }
    },
    [mutations, editor, openFolder, parseInlineName, refreshTree, vaultPath],
  );

  const handleCancelEdit = useCallback(() => {
    mutations.clearGhost();
  }, [mutations]);

  // After deleting the current note, clear the editor
  const handleConfirmDelete = useCallback(async () => {
    const deletesSelectedEditor =
      editor.selected !== null &&
      mutations.pendingDeletePaths.includes(editor.selected.path);
    const deleted = await mutations.confirmDelete();
    if (deleted && deletesSelectedEditor) {
      editor.closeNote();
    }
  }, [mutations, editor]);

  const handleMenuNewNote = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(() => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      mutations.createNoteInline(ctx);
    }, 0);
  }, [contextMenu, deriveParentContextFromMenuTarget, mutations, openFolder]);

  const handleMenuNewFolder = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(() => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      mutations.createFolderInline(ctx);
    }, 0);
  }, [contextMenu, deriveParentContextFromMenuTarget, mutations, openFolder]);

  const handleMenuMove = useCallback(() => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node) return;

    const includeSelection =
      selection.selectedIds.size > 1 &&
      selection.selectedIds.has(target.node.path);

    const sourceNodes = includeSelection
      ? treeNodes.filter((n) => selection.selectedIds.has(n.path))
      : [target.node];

    clipboard.setCutItems(
      sourceNodes.map((node) => ({
        path: node.path,
        isFolder: node.kind === "folder",
      })),
    );
    contextMenu.closeMenu();
  }, [clipboard, contextMenu, selection.selectedIds, treeNodes]);

  const handleMenuPaste = useCallback(async () => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "file") return;

    const destinationRelPath =
      target.kind === "folder" ? (target.node?.relPath ?? "") : "";

    const moved = await mutations.movePaths(
      clipboard.clipboard.items.map((item) => item.path),
      destinationRelPath,
    );
    if (moved) {
      clipboard.clearClipboard();
      await refreshTree();
      if (destinationRelPath) {
        openFolder(destinationRelPath);
      }
    }
    contextMenu.closeMenu();
  }, [clipboard, contextMenu, mutations, openFolder, refreshTree]);

  const handleMenuDelete = useCallback(() => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node) return;

    const shouldUseSelection =
      selection.selectedIds.size > 1 &&
      selection.selectedIds.has(target.node.path);

    if (shouldUseSelection) {
      const nodes = treeNodes.filter((n) => selection.selectedIds.has(n.path));
      mutations.requestDeleteMany(
        nodes.map((node) => ({ path: node.path, name: node.name })),
      );
    } else {
      mutations.requestDelete(target.node.path, target.node.name);
    }
    contextMenu.closeMenu();
  }, [contextMenu, mutations, selection.selectedIds, treeNodes]);

  const isMultiSelectContextMenu = contextMenu.menuState.isMultiSelect;

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
        onCreateNote={startNoteInline}
        onDeleteNote={() => {
          if (selection.selectedIds.size > 0) {
            const nodes = treeNodes.filter((n) =>
              selection.selectedIds.has(n.path),
            );
            mutations.requestDeleteMany(
              nodes.map((node) => ({ path: node.path, name: node.name })),
            );
          } else if (editor.selected) {
            mutations.requestDelete(editor.selected.path, editor.selected.name);
          }
        }}
      />
      {/* Activity Bar */}
      <AppActivityBar />

      {/* ── Left sidebar: file tree ── */}
      <AppSidebar
        defaultWidth={boot.workspace?.sidebarWidth as number | undefined}
        onCreateNote={startNoteInline}
        onCreateFolder={startFolderInline}
      >
        <FileTree
          visibleNodes={visibleNodes}
          openFolders={openFolders}
          selectedIds={selection.selectedIds}
          cutIds={cutIds}
          onFileClick={(node: FlatTreeNode, e) => {
            setFocusedNode(node);
            selection.handleSelect(
              {
                id: node.path,
                name: node.name,
                isFolder: node.kind === "folder",
                depth: node.depth,
              },
              {
                metaKey: (e as React.MouseEvent).metaKey,
                ctrlKey: (e as React.MouseEvent).ctrlKey,
                shiftKey: (e as React.MouseEvent).shiftKey,
              },
              visibleNodes,
            );
            editor.loadNote({ name: node.name, path: node.path });
          }}
          onFolderToggle={(node: FlatTreeNode, e) => {
            setFocusedNode(node);
            selection.handleSelect(
              {
                id: node.path,
                name: node.name,
                isFolder: true,
                depth: node.depth,
              },
              {
                metaKey: (e as React.MouseEvent).metaKey,
                ctrlKey: (e as React.MouseEvent).ctrlKey,
                shiftKey: (e as React.MouseEvent).shiftKey,
              },
              visibleNodes,
            );
            toggleFolder(node.relPath);
          }}
          onContextMenu={(node: FlatTreeNode, e) => {
            setFocusedNode(node);
            const isMultiSelect =
              selection.selectedIds.size > 1 &&
              selection.selectedIds.has(node.path);
            if (!selection.selectedIds.has(node.path)) {
              selection.setSelection(new Set([node.path]));
            }
            selection.setFocusedId(node.path);
            contextMenu.openForNode(node, e, isMultiSelect);
          }}
          onBackgroundContextMenu={(e) => {
            contextMenu.openForRoot(e);
          }}
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
      <FileTreeContextMenu
        open={contextMenu.isOpen}
        anchor={contextMenu.menuState.anchor}
        targetKind={contextMenu.menuState.target?.kind ?? null}
        isMultiSelect={isMultiSelectContextMenu}
        canPaste={canPasteToMenuTarget}
        onOpenChange={(open) => {
          if (!open) contextMenu.closeMenu();
        }}
        onNewNote={handleMenuNewNote}
        onNewFolder={handleMenuNewFolder}
        onMove={handleMenuMove}
        onPaste={handleMenuPaste}
        onDelete={handleMenuDelete}
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
        onConfirm={handleConfirmDelete}
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
