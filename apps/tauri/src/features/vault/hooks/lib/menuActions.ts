import type { FlatTreeNode } from "../../types";
import type { UseVaultMutationsReturn } from "../useVaultMutations";
import type { VaultClipboardApi } from "../useVaultClipboard";
import type { VaultContextMenuApi } from "../useVaultContextMenu";
import type { VaultSelectionApi } from "../useVaultSelection";
import type { CopyAsFormat } from "./copyActions";
import { copyNodeAs } from "./copyActions";
import type { VaultNoteController } from "./types";

export interface MenuActionsDeps {
  contextMenu: VaultContextMenuApi;
  mutations: UseVaultMutationsReturn;
  selection: VaultSelectionApi;
  clipboard: VaultClipboardApi;
  editor: VaultNoteController;
  treeNodes: FlatTreeNode[];
  vaultPath: string | null;
  deriveParentContextFromMenuTarget: () => {
    parentRelPath: string;
    depth: number;
  };
  openFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
  onPathsMoved?: (sourcePaths: string[], destinationRelPath: string) => void;
}

export interface MenuActions {
  onMenuRename: () => void;
  handleConfirmDelete: () => Promise<void>;
  onMenuNewNote: () => void;
  onMenuNewFolder: () => void;
  onMenuCut: () => void;
  onMenuPaste: () => Promise<void>;
  onMenuDelete: () => void;
  handleDeleteFromCommands: () => void;
  onCopyPath: () => Promise<void>;
  onCopyAs: (format: CopyAsFormat) => Promise<void>;
}

/** Context-menu actions + the delete paths shared with command palette.
 * Selection-aware: when the right-clicked node is one of a multi-select,
 * cut/delete act on the whole selection. */
export function createMenuActions(deps: MenuActionsDeps): MenuActions {
  const {
    contextMenu,
    mutations,
    selection,
    clipboard,
    editor,
    treeNodes,
    vaultPath,
    deriveParentContextFromMenuTarget,
    openFolder,
    refreshTree,
    onPathsMoved,
  } = deps;

  /** The node the context menu was opened on (null for root / no target). */
  const menuTargetNode = (): FlatTreeNode | null => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node) return null;
    return target.node;
  };

  const onCopyPath = async () => {
    const node = menuTargetNode();
    if (!node) return;
    await copyNodeAs(
      "path",
      { relPath: node.relPath, name: node.name },
      vaultPath,
    );
    contextMenu.closeMenu();
  };

  const onCopyAs = async (format: CopyAsFormat) => {
    const node = menuTargetNode();
    if (!node) return;
    await copyNodeAs(
      format,
      { relPath: node.relPath, name: node.name },
      vaultPath,
    );
    contextMenu.closeMenu();
  };

  const onMenuRename = () => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node) return;
    contextMenu.closeMenu();
    const node = target.node;
    mutations.startRename({
      id: node.path,
      name: node.name,
      isFolder: node.kind === "folder",
      depth: node.depth,
      relPath: node.relPath,
      path: node.path,
    });
  };

  const handleConfirmDelete = async () => {
    const deletesSelectedEditor =
      editor.selected !== null &&
      mutations.pendingDeletePaths.includes(editor.selected.path);
    const deleted = await mutations.confirmDelete();
    if (deleted) {
      // Backend no longer emits vault://file-changed for app-initiated
      // deletes (write choke point contract) — refresh locally like the
      // other mutations do.
      await refreshTree();
      if (deletesSelectedEditor) editor.closeNote();
    }
  };

  const onMenuNewNote = () => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(async () => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      const result = await mutations.createUntitledNote(
        ctx.parentRelPath || undefined,
      );
      if (!result) return;
      void editor.loadNote({
        name: result.name,
        path: result.path,
        renameOnOpen: true,
      });
      await refreshTree();
    }, 0);
  };

  const onMenuNewFolder = () => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(() => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      mutations.createFolderInline(ctx);
    }, 0);
  };

  const onMenuCut = () => {
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
  };

  const onMenuPaste = async () => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "file") return;
    const destinationRelPath =
      target.kind === "folder" ? (target.node?.relPath ?? "") : "";
    const moved = await mutations.movePaths(
      clipboard.clipboard.items.map((item) => item.path),
      destinationRelPath,
    );
    if (moved) {
      // Report BEFORE clearing the clipboard — the caller needs the source
      // paths to repoint anything tracking them (open tabs).
      onPathsMoved?.(
        clipboard.clipboard.items.map((item) => item.path),
        destinationRelPath,
      );
      clipboard.clearClipboard();
      await refreshTree();
      if (destinationRelPath) openFolder(destinationRelPath);
    }
    contextMenu.closeMenu();
  };

  const onMenuDelete = () => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node) return;
    const shouldUseSelection =
      selection.selectedIds.size > 1 &&
      selection.selectedIds.has(target.node.path);
    if (shouldUseSelection) {
      const nodes = treeNodes.filter((n) => selection.selectedIds.has(n.path));
      if (nodes.length > 0) {
        mutations.requestDeleteMany(
          nodes.map((node) => ({ path: node.path, name: node.name })),
        );
      } else {
        mutations.requestDelete(target.node.path, target.node.name);
      }
    } else {
      mutations.requestDelete(target.node.path, target.node.name);
    }
    contextMenu.closeMenu();
  };

  const handleDeleteFromCommands = () => {
    if (selection.selectedIds.size > 0) {
      const nodes = treeNodes.filter((n) => selection.selectedIds.has(n.path));
      if (nodes.length > 0) {
        mutations.requestDeleteMany(
          nodes.map((node) => ({ path: node.path, name: node.name })),
        );
      } else if (editor.selected) {
        mutations.requestDelete(editor.selected.path, editor.selected.name);
      }
    } else if (editor.selected) {
      mutations.requestDelete(editor.selected.path, editor.selected.name);
    }
  };

  return {
    onMenuRename,
    handleConfirmDelete,
    onMenuNewNote,
    onMenuNewFolder,
    onMenuCut,
    onMenuPaste,
    onMenuDelete,
    handleDeleteFromCommands,
    onCopyPath,
    onCopyAs,
  };
}
