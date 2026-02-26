import { FileTree as FileTreeUI, type FileNode } from "@workspace/ui/components/file-tree";
import type { FlatTreeNode } from "../types";

export interface FileTreeProps {
  visibleNodes: FlatTreeNode[];
  openFolders: Set<string>;
  selectedPath: string | null;
  onFileClick: (node: FlatTreeNode) => void;
  onFolderToggle: (relPath: string) => void;
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
}: FileTreeProps) {
  // Map Tauri-specific nodes to the dumb UI primitives
  const mappedNodes = visibleNodes.map((node) => ({
    id: node.path,
    name: node.name,
    isFolder: node.kind === "folder",
    isOpen: openFolders.has(node.relPath),
    depth: node.depth,
    childCount: node.childCount,
  } satisfies FileNode));

  const handleSelect = (fileNode: FileNode) => {
    // Re-lookup the original `FlatTreeNode` from `visibleNodes` by path
    const original = visibleNodes.find(n => n.path === fileNode.id);
    if (original) onFileClick(original);
  };

  const handleToggle = (fileNode: FileNode) => {
    // Re-lookup to pass the relPath to Tauri
    const original = visibleNodes.find(n => n.path === fileNode.id);
    if (original) onFolderToggle(original.relPath);
  };

  return (
    <FileTreeUI
      nodes={mappedNodes}
      selectedId={selectedPath}
      expandedIds={new Set()} // Unused, we provide isOpen natively above
      onSelect={handleSelect}
      onToggleExpand={handleToggle}
    />
  );
}
