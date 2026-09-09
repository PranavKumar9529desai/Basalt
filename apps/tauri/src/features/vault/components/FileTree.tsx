import {
  type FileNode,
  FileTree as FileTreeUI,
} from "@workspace/ui/components/file-tree";
import { useMemo } from "react";
import type { FlatTreeNode } from "../types";

export interface FileTreeProps {
  visibleNodes: FlatTreeNode[];
  openFolders: Set<string>;
  selectedIds?: Set<string>;
  cutIds?: Set<string>;
  onFileClick: (node: FlatTreeNode, e: React.UIEvent) => void;
  onFolderToggle: (node: FlatTreeNode, e: React.UIEvent) => void;
  onContextMenu?: (node: FlatTreeNode, e: React.MouseEvent) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
  /** Ghost node for inline creation (rendered under the correct parent). */
  ghostNode?: (FileNode & { parentRelPath?: string }) | null;
  /** Called when the user commits an inline edit (Enter/blur). */
  onCommitEdit?: (node: FileNode, newName: string) => void;
  /** Called when the user cancels an inline edit (Escape). */
  onCancelEdit?: (node: FileNode) => void;
  /** Node currently in inline rename mode — rendered as an editing row in
   *  place (stem shown for notes; folders keep their name). */
  renamingNode?: (FileNode & { path?: string }) | null;
  /** Called when the user commits an inline rename (Enter/blur). */
  onCommitRename?: (node: FileNode, newName: string) => void;
  /** Called when the user cancels an inline rename (Escape / empty commit). */
  onCancelRename?: (node: FileNode) => void;
  /** Called on primary pointerdown over a file row. The caller decides whether
   *  the press becomes a drag (threshold) or stays a click. */
  onDragStart?: (node: FlatTreeNode, e: React.PointerEvent) => void;
}

/**
 * The vault sidebar file tree.
 *
 * Receives a pre-sorted, pre-annotated flat array from Rust (via
 * `useVaultTree`). Converts it into the dumb `FileNode` format
 * expected by the virtualized `@workspace/ui/components/file-tree`.
 */
export function FileTree({
  visibleNodes,
  openFolders,
  selectedIds,
  cutIds,
  onFileClick,
  onFolderToggle,
  onContextMenu,
  onBackgroundContextMenu,
  ghostNode,
  onCommitEdit,
  onCancelEdit,
  renamingNode,
  onCommitRename,
  onCancelRename,
  onDragStart,
}: FileTreeProps) {
  // O(1) map for instant node resolution on click/interaction (critical for 25k+ notes)
  const nodeMap = useMemo(() => {
    const map = new Map<string, FlatTreeNode>();
    for (const node of visibleNodes) {
      map.set(node.path, node);
    }
    return map;
  }, [visibleNodes]);

  // Map Tauri-specific nodes to the dumb UI primitives with memoization
  const mappedNodes: FileNode[] = useMemo(() => {
    const list: FileNode[] = visibleNodes.map(
      (node) =>
        ({
          id: node.path,
          name: node.name,
          isFolder: node.kind === "folder",
          isOpen: openFolders.has(node.relPath),
          depth: node.depth,
          childCount: node.childCount,
          isCut: cutIds?.has(node.path) ?? false,
        }) satisfies FileNode,
    );

    // The renaming node replaces its row in place with an editing input. Notes
    // show their stem (the backend re-appends .md); folders show their name.
    if (renamingNode) {
      const index = list.findIndex((n) => n.id === renamingNode.id);
      if (index !== -1) {
        const isFolder = renamingNode.isFolder;
        list[index] = {
          ...list[index],
          isEditing: true,
          name: isFolder
            ? renamingNode.name
            : renamingNode.name.replace(/\.(md|canvas)$/i, ""),
        };
      }
    }

    // Insert the ghost node directly under its intended parent
    if (ghostNode) {
      const parentRel = ghostNode.parentRelPath ?? "";
      let insertAt = 0;

      if (parentRel) {
        const parentIndex = visibleNodes.findIndex(
          (n) => n.relPath === parentRel,
        );
        if (parentIndex !== -1) {
          const parentPath = visibleNodes[parentIndex].path;
          const mappedParentIndex = list.findIndex(
            (n) => n.id === parentPath,
          );
          insertAt =
            mappedParentIndex === -1 ? list.length : mappedParentIndex + 1;
        } else {
          insertAt = list.length;
        }
      } else {
        // Find last root item with a fast reverse loop
        let lastRootIndex = -1;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].depth === 0) {
            lastRootIndex = i;
            break;
          }
        }
        insertAt = lastRootIndex !== -1 ? lastRootIndex + 1 : 0;
      }

      list.splice(insertAt, 0, ghostNode);
    }

    return list;
  }, [visibleNodes, openFolders, cutIds, renamingNode, ghostNode]);

  const handleSelect = (fileNode: FileNode, e: React.UIEvent) => {
    const original = nodeMap.get(fileNode.id);
    if (original) onFileClick(original, e);
  };

  const handleToggle = (fileNode: FileNode, e: React.UIEvent) => {
    const original = nodeMap.get(fileNode.id);
    if (original) onFolderToggle(original, e);
  };

  const handleContextMenu = (fileNode: FileNode, e: React.MouseEvent) => {
    if (!onContextMenu) return;
    const original = nodeMap.get(fileNode.id);
    if (original) onContextMenu(original, e);
  };

  const handleDragStart = (fileNode: FileNode, e: React.PointerEvent) => {
    const original = nodeMap.get(fileNode.id);
    if (original) onDragStart?.(original, e);
  };

  // Route inline edits by which node is editing: the ghost node commits
  // through the creation flow, the renaming node through the rename flow.
  const handleCommit = (fileNode: FileNode, newName: string) => {
    if (renamingNode && fileNode.id === renamingNode.id) {
      onCommitRename?.(fileNode, newName);
    } else {
      onCommitEdit?.(fileNode, newName);
    }
  };

  const handleCancel = (fileNode: FileNode) => {
    if (renamingNode && fileNode.id === renamingNode.id) {
      onCancelRename?.(fileNode);
    } else {
      onCancelEdit?.(fileNode);
    }
  };

  return (
    <FileTreeUI
      nodes={mappedNodes}
      selectedIds={selectedIds}
      onSelect={handleSelect}
      onToggleExpand={handleToggle}
      onContextMenu={handleContextMenu}
      onBackgroundContextMenu={onBackgroundContextMenu}
      onCommitEdit={handleCommit}
      onCancelEdit={handleCancel}
      onDragStart={handleDragStart}
    />
  );
}
