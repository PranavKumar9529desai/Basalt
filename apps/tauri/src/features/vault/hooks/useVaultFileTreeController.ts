import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useMemo, useState } from "react";
import type { UseEditorReturn } from "../../editor/hooks/useEditor";
import type { FlatTreeNode } from "../types";
import type { UseVaultClipboardReturn } from "./useVaultClipboard";
import type { UseVaultContextMenuReturn } from "./useVaultContextMenu";
import type { UseVaultMutationsReturn } from "./useVaultMutations";
import type { UseVaultSelectionReturn } from "./useVaultSelection";

export interface UseVaultFileTreeControllerOptions {
  treeNodes: FlatTreeNode[];
  visibleNodes: FlatTreeNode[];
  vaultPath: string | null;
  editor: UseEditorReturn;
  mutations: UseVaultMutationsReturn;
  selection: UseVaultSelectionReturn;
  clipboard: UseVaultClipboardReturn;
  contextMenu: UseVaultContextMenuReturn;
  openFolder: (relPath: string) => void;
  toggleFolder: (relPath: string) => void;
  refreshTree: () => Promise<void>;
  onFileOpen?: (node: FlatTreeNode) => void;
}

export interface UseVaultFileTreeControllerReturn {
  startNoteInline: () => void;
  startFolderInline: () => void;
  cutIds: Set<string>;
  canPasteToMenuTarget: boolean;
  isMultiSelectContextMenu: boolean;
  handleCommitEdit: (
    node: FileNode & { parentRelPath?: string },
    newName: string,
  ) => Promise<void>;
  handleCancelEdit: () => void;
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
  onMenuDelete: () => void;
}

export function useVaultFileTreeController({
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
  onFileOpen,
}: UseVaultFileTreeControllerOptions): UseVaultFileTreeControllerReturn {
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
    [mutations, parseInlineName, vaultPath, openFolder, refreshTree, editor],
  );

  const handleCancelEdit = useCallback(() => {
    mutations.clearGhost();
  }, [mutations]);

  const handleConfirmDelete = useCallback(async () => {
    const deletesSelectedEditor =
      editor.selected !== null &&
      mutations.pendingDeletePaths.includes(editor.selected.path);
    const deleted = await mutations.confirmDelete();
    if (deleted && deletesSelectedEditor) {
      editor.closeNote();
    }
  }, [editor, mutations]);

  const onMenuNewNote = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(() => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      mutations.createNoteInline(ctx);
    }, 0);
  }, [contextMenu, deriveParentContextFromMenuTarget, mutations, openFolder]);

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
      clipboard.clearClipboard();
      await refreshTree();
      if (destinationRelPath) {
        openFolder(destinationRelPath);
      }
    }
    contextMenu.closeMenu();
  }, [clipboard, contextMenu, mutations, openFolder, refreshTree]);

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
      if (onFileOpen) {
        onFileOpen(node);
      } else {
        editor.loadNote({ name: node.name, path: node.path });
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
    startNoteInline,
    startFolderInline,
    cutIds,
    canPasteToMenuTarget,
    isMultiSelectContextMenu: contextMenu.menuState.isMultiSelect,
    handleCommitEdit,
    handleCancelEdit,
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
    onMenuDelete,
  };
}
