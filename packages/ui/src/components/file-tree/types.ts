export interface FileNode {
  id: string; // The unique identifier for the node (often the path)
  name: string; // The display name
  isFolder: boolean; // Whether the node is a folder/directory
  isOpen?: boolean; // Whether the node is currently open/expanded
  depth: number; // The indentation depth level (0 is root level)
  childCount?: number; // How many children this folder has, to show the child count badge
}

export interface FileTreeProps {
  nodes: FileNode[]; // Flat array of VISIBLE nodes
  selectedId?: string | null;
  expandedIds: Set<string>;
  onSelect: (node: FileNode, e: React.UIEvent) => void;
  onToggleExpand: (node: FileNode, e: React.UIEvent) => void;
  onContextMenu?: (node: FileNode, e: React.MouseEvent) => void;
  className?: string;
}
