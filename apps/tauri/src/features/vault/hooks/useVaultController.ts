// ---------------------------------------------------------------------------
// useVaultController — single hook merging selection, clipboard, context menu,
// and file-tree controller logic (was 4 separate hooks).
// ---------------------------------------------------------------------------

import type { FileNode } from "@workspace/ui/components/file-tree";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  FlatTreeNode,
} from "../types";
import type { UseVaultMutationsReturn } from "./useVaultMutations";

// ---- In-memory clipboard state (was useVaultClipboard) ----

interface VaultClipboardItem {
  path: string;
  isFolder: boolean;
}

interface VaultClipboardState {
  operation: "cut" | null;
  items: VaultClipboardItem[];
  timestamp: number | null;
}

function useVaultClipboardState() {
  const [clipboard, setClipboard] = useState<VaultClipboardState>({
    operation: null,
    items: [],
    timestamp: null,
  });

  const hasItems =
    clipboard.operation === "cut" && clipboard.items.length > 0;
  const setCutItems = useCallback((items: VaultClipboardItem[]) => {
    setClipboard({ operation: "cut", items, timestamp: Date.now() });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard({ operation: null, items: [], timestamp: null });
  }, []);

  const cutPaths = useMemo(
    () => new Set(clipboard.items.map((item) => item.path)),
    [clipboard.items],
  );

  const isCutPath = useCallback(
    (path: string) => cutPaths.has(path),
    [cutPaths],
  );

  return {
    clipboard,
    hasItems,
    setCutItems,
    clearClipboard,
    isCutPath,
  };
}

// ---- Context menu state (was useVaultContextMenu) ----

type VaultContextTargetKind = "file" | "folder" | "root";

interface VaultContextTarget {
  kind: VaultContextTargetKind;
  node: FlatTreeNode | null;
}

interface VaultContextMenuState {
  anchor: { x: number; y: number } | null;
  target: VaultContextTarget | null;
  isMultiSelect: boolean;
}

function useVaultContextMenuState() {
  const [menuState, setMenuState] = useState<VaultContextMenuState>({
    anchor: null,
    target: null,
    isMultiSelect: false,
  });

  const openForNode = useCallback(
    (node: FlatTreeNode, e: React.MouseEvent, isMultiSelect: boolean) => {
      setMenuState({
        anchor: { x: e.clientX, y: e.clientY },
        target: { kind: node.kind as VaultContextTargetKind, node },
        isMultiSelect,
      });
    },
    [],
  );

  const openForRoot = useCallback((e: React.MouseEvent) => {
    setMenuState({
      anchor: { x: e.clientX, y: e.clientY },
      target: { kind: "root", node: null },
      isMultiSelect: false,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({ anchor: null, target: null, isMultiSelect: false });
  }, []);

  return {
    menuState,
    isOpen: menuState.target !== null,
    openForNode,
    openForRoot,
    closeMenu,
  };
}

// ---- Selection state (was useVaultSelection) ----

function useVaultSelectionState() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const setSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleSelect = useCallback(
    (
      node: FileNode,
      modifiers: {
        metaKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
      },
      visibleNodes: FlatTreeNode[],
    ) => {
      const isMeta = Boolean(modifiers.metaKey || modifiers.ctrlKey);
      const isShift = Boolean(modifiers.shiftKey);
      const next = new Set(selectedIds);
      const indexById = new Map<string, number>();
      visibleNodes.forEach((n, idx) => {
        indexById.set(n.path, idx);
      });
      const clickedId = node.id;

      if (isShift && anchorId && indexById.has(anchorId)) {
        const start = indexById.get(anchorId) ?? 0;
        const end = indexById.get(clickedId) ?? start;
        const [lo, hi] = start < end ? [start, end] : [end, start];
        next.clear();
        for (let i = lo; i <= hi; i++) next.add(visibleNodes[i].path);
      } else if (isMeta) {
        if (next.has(clickedId)) next.delete(clickedId);
        else next.add(clickedId);
      } else {
        next.clear();
        next.add(clickedId);
        setAnchorId(clickedId);
      }

      setFocusedId(clickedId);
      setSelectedIds(next);
      if (!isShift && !isMeta) setAnchorId(clickedId);
    },
    [anchorId, selectedIds],
  );

  return {
    selectedIds,
    anchorId,
    focusedId,
    handleSelect,
    setSelection,
    clearSelection,
    setFocusedId,
  };
}

// ---- Editor interface (same shape as before) ----

interface NoteSelection {
  name: string;
  path: string;
}

interface VaultNoteController {
  selected: NoteSelection | null;
  loadNote: (note: NoteSelection) => void | Promise<void>;
  closeNote: () => void;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseVaultControllerReturn {
  // Controller methods (previously from useVaultFileTreeController)
  createNoteInstant: () => Promise<void>;
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
  // Selection state (merged from useVaultSelection)
  selection: ReturnType<typeof useVaultSelectionState>;
  // Context menu state (merged from useVaultContextMenu)
  contextMenu: ReturnType<typeof useVaultContextMenuState>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultController({
  treeNodes,
  visibleNodes,
  vaultPath,
  editor,
  mutations,
  openFolder,
  toggleFolder,
  refreshTree,
  onFileOpen,
}: UseVaultControllerOptions): UseVaultControllerReturn {
  const selection = useVaultSelectionState();
  const clipboard = useVaultClipboardState();
  const contextMenu = useVaultContextMenuState();

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
      const parentDepth = isFolder
        ? node.depth
        : Math.max(0, node.depth - 1);
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
    editor.loadNote({ name: result.name, path: result.path });
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
    async (
      node: FileNode & { parentRelPath?: string },
      newName: string,
    ) => {
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
        if (result) editor.loadNote({ name: result.name, path: result.path });
        if (parentRelPath) openFolder(parentRelPath);
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
    if (deleted && deletesSelectedEditor) editor.closeNote();
  }, [editor, mutations]);

  const onMenuNewNote = useCallback(() => {
    const ctx = deriveParentContextFromMenuTarget();
    contextMenu.closeMenu();
    setTimeout(async () => {
      if (ctx.parentRelPath) openFolder(ctx.parentRelPath);
      const result = await mutations.createUntitledNote(
        ctx.parentRelPath || undefined,
      );
      if (!result) return;
      editor.loadNote({ name: result.name, path: result.path });
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
      clipboard.clearClipboard();
      await refreshTree();
      if (destinationRelPath) openFolder(destinationRelPath);
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
      const nodes = treeNodes.filter((n) =>
        selection.selectedIds.has(n.path),
      );
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
        prev !== null &&
        prev.path === node.path &&
        now - prev.atMs <= 320;
      lastFileClickRef.current = { path: node.path, atMs: now };
      const mode: "preview" | "pinned" = isDoubleClick ? "pinned" : "preview";
      if (onFileOpen) {
        onFileOpen(node, mode);
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
        selection.selectedIds.size > 1 &&
        selection.selectedIds.has(node.path);
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
      const nodes = treeNodes.filter((n) =>
        selection.selectedIds.has(n.path),
      );
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
    // Controller methods
    createNoteInstant,
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
    // Exposed state
    selection,
    contextMenu,
  };
}
