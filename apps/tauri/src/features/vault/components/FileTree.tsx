import {
  FileTree as FileTreeUI,
  type FileNode,
} from "@workspace/ui/components/file-tree";
import type { FlatTreeNode } from "../types";

export interface FileTreeProps {
  visibleNodes: FlatTreeNode[];
  openFolders: Set<string>;
  selectedPath: string | null;
  onFileClick: (node: FlatTreeNode) => void;
  onFolderToggle: (relPath: string) => void;
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
  selectedPath,
  onFileClick,
  onFolderToggle,
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
      }) satisfies FileNode,
  );

  // Insert the ghost node directly under its intended parent
  if (ghostNode) {
    const parentRel = ghostNode.parentRelPath ?? "";

    // Default insertion: start of list
    let insertAt = 0;

    if (parentRel) {
      // Find the parent in the visible list
      const parentIndex = visibleNodes.findIndex((n) => n.relPath === parentRel);
      if (parentIndex !== -1) {
        const parentPath = visibleNodes[parentIndex].path;
        const mappedParentIndex = mappedNodes.findIndex((n) => n.id === parentPath);
        insertAt = mappedParentIndex === -1 ? mappedNodes.length : mappedParentIndex + 1;
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

  const handleSelect = (fileNode: FileNode) => {
    // Re-lookup the original `FlatTreeNode` from `visibleNodes` by path
    const original = visibleNodes.find((n) => n.path === fileNode.id);
    if (original) onFileClick(original);
  };

  const handleToggle = (fileNode: FileNode) => {
    // Re-lookup to pass the relPath to Tauri
    const original = visibleNodes.find((n) => n.path === fileNode.id);
    if (original) onFolderToggle(original.relPath);
  };

  return (
    <FileTreeUI
      nodes={mappedNodes}
      selectedId={selectedPath}
      expandedIds={new Set()} // Unused, we provide isOpen natively above
      onSelect={handleSelect}
      onToggleExpand={handleToggle}
      onCommitEdit={onCommitEdit}
      onCancelEdit={onCancelEdit}
    />
  );
}
