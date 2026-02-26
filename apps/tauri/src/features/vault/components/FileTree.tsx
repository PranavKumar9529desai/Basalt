import {
  type FileNode,
  FileTree as FileTreeUI,
} from "@workspace/ui/components/file-tree";
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
}: FileTreeProps) {
  // Map Tauri-specific nodes to the dumb UI primitives
  const mappedNodes: FileNode[] = visibleNodes.map(
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

  // Insert the ghost node directly under its intended parent
  if (ghostNode) {
    const parentRel = ghostNode.parentRelPath ?? "";

    // Default insertion: start of list
    let insertAt = 0;

    if (parentRel) {
      // Find the parent in the visible list
      const parentIndex = visibleNodes.findIndex(
        (n) => n.relPath === parentRel,
      );
      if (parentIndex !== -1) {
        const parentPath = visibleNodes[parentIndex].path;
        const mappedParentIndex = mappedNodes.findIndex(
          (n) => n.id === parentPath,
        );
        insertAt =
          mappedParentIndex === -1 ? mappedNodes.length : mappedParentIndex + 1;
      } else {
        insertAt = mappedNodes.length;
      }
    } else {
      // Root-level: place after the last root item for a natural order
      const lastRootIndex = [...mappedNodes]
        .map((n, idx) => (n.depth === 0 ? idx : -1))
        .filter((idx) => idx !== -1)
        .pop();
      insertAt = lastRootIndex !== undefined ? lastRootIndex + 1 : 0;
    }

    mappedNodes.splice(insertAt, 0, ghostNode);
  }

  const handleSelect = (fileNode: FileNode, e: React.UIEvent) => {
    // Re-lookup the original `FlatTreeNode` from `visibleNodes` by path
    const original = visibleNodes.find((n) => n.path === fileNode.id);
    if (original) onFileClick(original, e);
  };

  const handleToggle = (fileNode: FileNode, e: React.UIEvent) => {
    // Re-lookup to pass the relPath to Tauri
    const original = visibleNodes.find((n) => n.path === fileNode.id);
    if (original) onFolderToggle(original, e);
  };

  const handleContextMenu = (fileNode: FileNode, e: React.MouseEvent) => {
    if (!onContextMenu) return;
    const original = visibleNodes.find((n) => n.path === fileNode.id);
    if (original) onContextMenu(original, e);
  };

  return (
    <FileTreeUI
      nodes={mappedNodes}
      selectedIds={selectedIds}
      onSelect={handleSelect}
      onToggleExpand={handleToggle}
      onContextMenu={handleContextMenu}
      onBackgroundContextMenu={onBackgroundContextMenu}
      onCommitEdit={onCommitEdit}
      onCancelEdit={onCancelEdit}
    />
  );
}
