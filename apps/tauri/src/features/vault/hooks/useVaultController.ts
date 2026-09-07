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

interface NoteSelection {
  name: string;
  path: string;
  /** Transient: enter the note's title-rename flow once on open (note creation). */
  renameOnOpen?: boolean;
}

/** A tree item chosen for renaming — cross-feature rename is delegated to the
 *  caller (shared/useWorkspace) via `onRenameNode`: it decides notes vs
 *  folders/attachments, refreshes the tree, and repoints open tabs. */
export interface RenameTarget {
  path: string;
  name: string;
  isFolder: boolean;
}

interface VaultNoteController {
  selected: NoteSelection | null;
  loadNote: (note: NoteSelection) => void | Promise<void>;
  closeNote: () => void;
}

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
 * context-menu, and file-operation logic. Kept cohesive (one responsibility —
 * file-tree interaction) rather than fragmented by line count; the three state
 * sub-hooks live in sibling hook files and are composed here.
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
      const isFolder = node.kind === "folder";
      const parentRelPath = isFolder
        ? node.relPath
        : (() => {
            const lastSlash = node.relPath.lastIndexOf("/");
            return lastSlash === -1 ? "" : node.relPath.slice(0, lastSlash);
          })();
      const parentDepth = isFolder ? node.depth : Math.max(0, node.depth - 1);
      return { parentRelPath, depth: parentDepth + 1 };
    },
    [focusedNode, selectedNode],
  );

  const deriveParentContextFromMenuTarget = useCallback(() => {
    const target = contextMenu.menuState.target;
    if (!target || target.kind === "root" || !target.node)
      return { parentRelPath: "", depth: 0 };
    return deriveParentContext(target.node);
  }, [contextMenu.menuState.target, deriveParentContext]);

  const createNoteInstant = useCallback(async () => {
    const ctx = deriveParentContext();
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
  }, [deriveParentContext, editor, mutations, openFolder, refreshTree]);
  const createCanvasInstant = useCallback(async () => {
    const ctx = deriveParentContext();
    if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
    const result = await mutations.createUntitledCanvas(
      ctx.parentRelPath || undefined,
    );
    if (!result) return;
    void editor.loadNote({
      name: result.name,
      path: result.path,
      renameOnOpen: true,
    });
    await refreshTree();
  }, [deriveParentContext, editor, mutations, openFolder, refreshTree]);

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
      if (baseParent)
        parentSegments.unshift(...baseParent.split("/").filter(Boolean));
      return {
        leaf,
        parentRelPath: parentSegments.join("/"),
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
          if (relPath) openFolder(relPath);
        }
        await refreshTree();
      } else {
        const result = await mutations.createNote(
          leaf,
          parentRelPath || undefined,
        );
        if (result)
          void editor.loadNote({ name: result.name, path: result.path });
        if (parentRelPath) openFolder(parentRelPath);
        await refreshTree();
      }
    },
    [mutations, parseInlineName, vaultPath, openFolder, refreshTree, editor],
  );

  const handleCancelEdit = useCallback(() => {
    mutations.clearGhost();
  }, [mutations]);

  // Inline rename (context-menu Rename). The editing row lives at the node's
  // own path — no creation, no re-parenting — so the commit is just a
  // same-parent rename routed to the caller's orchestrator (which decides
  // rename_note vs rename_path and repoints open tabs).
  const handleCommitRename = useCallback(
    async (node: FileNode & { parentRelPath?: string }, newName: string) => {
      const trimmed = newName.trim();
      const target = treeNodes.find((n) => n.path === node.id);
      if (!target || !trimmed) {
        mutations.clearRename();
        return;
      }
      mutations.clearRename();
      const isFolder = node.isFolder ?? target.kind === "folder";
      if (trimmed === target.name) return;
      // Notes are renamed by stem (the backend re-appends .md); folders and
      // attachments keep the name as typed (backend preserves extensions).
      const newNameResolved =
        isFolder || !target.name.toUpperCase().endsWith(".MD")
          ? trimmed
          : trimmed.replace(/\.md$/i, "");
      if (newNameResolved === target.name.replace(/\.md$/i, "")) return;
      void onRenameNode?.(
        { path: target.path, name: target.name, isFolder },
        newNameResolved,
      );
    },
    [mutations, onRenameNode, treeNodes],
  );

  const handleCancelRename = useCallback(() => {
    mutations.clearRename();
  }, [mutations]);

  const onMenuRename = useCallback(() => {
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
  }, [contextMenu, mutations]);

  const handleConfirmDelete = useCallback(async () => {
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
  }, [editor, mutations, refreshTree]);

  const onMenuNewNote = useCallback(() => {
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
  }, [
    contextMenu,
    deriveParentContextFromMenuTarget,
    editor,
    mutations,
    openFolder,
    refreshTree,
  ]);

  const onMenuNewFolder = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(() => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      mutations.createFolderInline(ctx);
    }, 0);
  }, [contextMenu, deriveParentContextFromMenuTarget, mutations, openFolder]);

  const onMenuCut = useCallback(() => {
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

  const onMenuPaste = useCallback(async () => {
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
  }, [
    clipboard,
    contextMenu,
    mutations,
    openFolder,
    refreshTree,
    onPathsMoved,
  ]);

  const onMenuDelete = useCallback(() => {
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
  }, [contextMenu, mutations, selection.selectedIds, treeNodes]);

  const onTreeFileClick = useCallback(
    (node: FlatTreeNode, e: React.UIEvent) => {
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
      const now = Date.now();
      const prev = lastFileClickRef.current;
      const isDoubleClick =
        prev !== null && prev.path === node.path && now - prev.atMs <= 320;
      lastFileClickRef.current = { path: node.path, atMs: now };
      const mode: "preview" | "pinned" = isDoubleClick ? "pinned" : "preview";
      if (onFileOpen) {
        onFileOpen(node, mode);
      } else {
        void editor.loadNote({ name: node.name, path: node.path });
      }
    },
    [editor, onFileOpen, selection, visibleNodes],
  );

  const onTreeFolderToggle = useCallback(
    (node: FlatTreeNode, e: React.UIEvent) => {
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
    },
    [selection, toggleFolder, visibleNodes],
  );

  const onTreeContextMenu = useCallback(
    (node: FlatTreeNode, e: React.MouseEvent) => {
      setFocusedNode(node);
      const isMultiSelect =
        selection.selectedIds.size > 1 && selection.selectedIds.has(node.path);
      if (!selection.selectedIds.has(node.path)) {
        selection.setSelection(new Set([node.path]));
      }
      selection.setFocusedId(node.path);
      contextMenu.openForNode(node, e, isMultiSelect);
    },
    [contextMenu, selection],
  );

  const onTreeBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      contextMenu.openForRoot(e);
    },
    [contextMenu],
  );

  const handleDeleteFromCommands = useCallback(() => {
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
  }, [editor.selected, mutations, selection.selectedIds, treeNodes]);

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
