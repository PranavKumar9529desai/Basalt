import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useMemo, useRef, useState } from "react";
import type { FlatTreeNode } from "../types";
import type { UseVaultMutationsReturn } from "./useVaultMutations";
import { useVaultClipboardState } from "./useVaultClipboard";
import {
  useVaultContextMenuState,
  type VaultContextMenuApi,
} from "./useVaultContextMenu";
import {
  useVaultSelectionState,
  type VaultSelectionApi,
} from "./useVaultSelection";
import { createCommitActions } from "./lib/commitActions";
import { createCreateActions } from "./lib/createActions";
import { createMenuActions } from "./lib/menuActions";
import { createTreeEvents } from "./lib/treeEvents";
import { parseInlineName, resolveRenameName } from "./lib/names";
import { parentContextFor } from "./lib/parentContext";
import type { RenameTarget, VaultNoteController } from "./lib/types";

export type { RenameTarget } from "./lib/types";

export interface UseVaultControllerOptions {
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  vaultPath: string | null;
  editor: VaultNoteController;
  mutations: UseVaultMutationsReturn;
  openFolder: (relPath: string) => void;
  toggleFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
  onFileOpen?: (node: FlatTreeNode, mode: "preview" | "pinned") => void;
  /**
   * Fired after a successful move/paste with the sources and destination.
   * Cross-feature wiring (e.g. repointing open tabs) belongs to the caller
   * — this hook must stay tabs-free.
   */
  onPathsMoved?: (sourcePaths: string[], destinationRelPath: string) => void;
  /**
   * Rename a node in place. The caller owns the backend invoke, tree refresh,
   * tab repointing, and (for folders) opening the renamed folder. This hook
   * only resolves the target and routes the new name.
   */
  onRenameNode?: (target: RenameTarget, newName: string) => Promise<unknown>;
}

export interface UseVaultControllerReturn {
  createNoteInstant: () => Promise<void>;
  createCanvasInstant: () => Promise<void>;
  startFolderInline: () => void;
  cutIds: Set<string>;
  canPasteToMenuTarget: boolean;
  isMultiSelectContextMenu: boolean;
  handleCommitEdit: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelEdit: () => void;
  /** Commit a tree inline rename (Enter/blur on the renaming node). */
  handleCommitRename: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelRename: () => void;
  handleConfirmDelete: () => Promise<void>;
  handleDeleteFromCommands: () => void;
  onTreeFileClick: (node: FlatTreeNode, e: React.UIEvent) => void;
  onTreeFolderToggle: (node: FlatTreeNode, e: React.UIEvent) => void;
  onTreeContextMenu: (node: FlatTreeNode, e: React.MouseEvent) => void;
  onTreeBackgroundContextMenu: (e: React.MouseEvent) => void;
  onMenuNewNote: () => void;
  onMenuNewFolder: () => void;
  onMenuCut: () => void;
  onMenuPaste: () => Promise<void>;
  onMenuRename: () => void;
  onMenuDelete: () => void;
  selection: VaultSelectionApi;
  contextMenu: VaultContextMenuApi;
}

/**
 * Single controller hook for the file tree: merges selection, clipboard,
 * context-menu, and mutation state, then composes focused handler factories
 * from `lib/` — instant creates, inline edit/rename commits, context-menu
 * actions, and direct tree events. Handlers keep their per-concern dep
 * scopes so identity (and thus FileTree re-renders) stays stable.
 */
export function useVaultController(
  options: UseVaultControllerOptions,
): UseVaultControllerReturn {
  const selection = useVaultSelectionState();
  const clipboard = useVaultClipboardState();
  const contextMenu = useVaultContextMenuState();
  const {
    treeNodes,
    visibleNodes,
    vaultPath,
    editor,
    mutations,
    openFolder,
    toggleFolder,
    refreshTree,
    onFileOpen,
    onPathsMoved,
    onRenameNode,
  } = options;

  const [focusedNode, setFocusedNode] = useState<FlatTreeNode | null>(null);
  const lastFileClickRef = useRef<{ path: string; atMs: number } | null>(null);

  const selectedNode = useMemo(
    () => treeNodes.find((n) => n.path === editor.selected?.path),
    [treeNodes, editor.selected],
  );

  const deriveParentContext = useCallback(
    (target?: FlatTreeNode) => {
      const node = target ?? focusedNode ?? selectedNode;
      if (!node) return { parentRelPath: "", depth: 0 };
      return parentContextFor(node);
    },
    [focusedNode, selectedNode],
  );

  const deriveParentContextFromMenuTarget = useCallback(() => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node)
      return { parentRelPath: "", depth: 0 };
    return deriveParentContext(target.node);
  }, [contextMenu.menuState.target, deriveParentContext]);

  const cutIds = useMemo(
    () => new Set(clipboard.clipboard.items.map((item) => item.path)),
    [clipboard.clipboard.items],
  );

  const canPasteToMenuTarget = useMemo(() => {
    if (!clipboard.hasItems) return false;
    const target = contextMenu.menuState.target;
    if (!target) return false;
    if (target.kind === "file") return false;
    const destPath =
      target.kind === "folder" ? (target.node?.path ?? null) : null;
    if (!destPath) return true;
    return clipboard.clipboard.items.every((item) => {
      if (item.path === destPath) return false;
      if (item.isFolder && destPath.startsWith(`${item.path}/`)) return false;
      return true;
    });
  }, [
    clipboard.clipboard.items,
    clipboard.hasItems,
    contextMenu.menuState.target,
  ]);

  const { createNoteInstant, createCanvasInstant, startFolderInline } =
    useMemo(
      () =>
        createCreateActions({
          deriveParentContext,
          editor,
          mutations,
          openFolder,
          refreshTree,
        }),
      [deriveParentContext, editor, mutations, openFolder, refreshTree],
    );

  const {
    handleCommitEdit,
    handleCancelEdit,
    handleCommitRename,
    handleCancelRename,
  } = useMemo(
    () =>
      createCommitActions({
        mutations,
        parseInlineName,
        resolveRenameName,
        vaultPath,
        openFolder,
        refreshTree,
        editor,
        treeNodes,
        onRenameNode,
      }),
    [
      mutations,
      vaultPath,
      openFolder,
      refreshTree,
      editor,
      treeNodes,
      onRenameNode,
    ],
  );
  const {
    onMenuRename,
    handleConfirmDelete,
    onMenuNewNote,
    onMenuNewFolder,
    onMenuCut,
    onMenuPaste,
    onMenuDelete,
    handleDeleteFromCommands,
  } = useMemo(
    () =>
      createMenuActions({
        contextMenu,
        mutations,
        selection,
        clipboard,
        editor,
        treeNodes,
        deriveParentContextFromMenuTarget,
        openFolder,
        refreshTree,
        onPathsMoved,
      }),
    [
      contextMenu,
      mutations,
      selection,
      clipboard,
      editor,
      treeNodes,
      deriveParentContextFromMenuTarget,
      openFolder,
      refreshTree,
      onPathsMoved,
    ],
  );

  const {
    onTreeFileClick,
    onTreeFolderToggle,
    onTreeContextMenu,
    onTreeBackgroundContextMenu,
  } = useMemo(
    () =>
      createTreeEvents({
        editor,
        onFileOpen,
        selection,
        visibleNodes,
        toggleFolder,
        contextMenu,
        setFocusedNode,
        lastFileClickRef,
      }),
    [
      editor,
      onFileOpen,
      selection,
      visibleNodes,
      toggleFolder,
      contextMenu,
      setFocusedNode,
      lastFileClickRef,
    ],
  );

  return {
    createNoteInstant,
    createCanvasInstant,
    startFolderInline,
    cutIds,
    canPasteToMenuTarget,
    isMultiSelectContextMenu: contextMenu.menuState.isMultiSelect,
    handleCommitEdit,
    handleCancelEdit,
    handleCommitRename,
    handleCancelRename,
    handleConfirmDelete,
    handleDeleteFromCommands,
    onTreeFileClick,
    onTreeFolderToggle,
    onTreeContextMenu,
    onTreeBackgroundContextMenu,
    onMenuNewNote,
    onMenuNewFolder,
    onMenuCut,
    onMenuPaste,
    onMenuRename,
    onMenuDelete,
    selection,
    contextMenu,
  };
}