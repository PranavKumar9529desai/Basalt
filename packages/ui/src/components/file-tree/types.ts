export interface FileNode {
  id: string; // The unique identifier for the node (often the path)
  name: string; // The display name
  isFolder: boolean; // Whether the node is a folder/directory
  isOpen?: boolean; // Whether the node is currently open/expanded
  depth: number; // The indentation depth level (0 is root level)
  childCount?: number; // How many children this folder has, to show the child count badge
  isEditing?: boolean; // When true, render an inline input instead of the label
  isCut?: boolean; // When true, render as a cut candidate (reduced emphasis)
}

export interface FileTreeProps {
  nodes: FileNode[]; // Flat array of VISIBLE nodes
  selectedIds?: Set<string>;
  onSelect: (node: FileNode, e: React.UIEvent) => void;
  onToggleExpand: (node: FileNode, e: React.UIEvent) => void;
  onContextMenu?: (node: FileNode, e: React.MouseEvent) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
  /** Called when the user confirms an inline edit (Enter or blur with text). */
  onCommitEdit?: (node: FileNode, newName: string) => void;
  /** Called when the user cancels an inline edit (Escape or blur with empty). */
  onCancelEdit?: (node: FileNode) => void;
  className?: string;
}
