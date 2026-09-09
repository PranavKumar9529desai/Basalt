import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
  UIEvent,
} from "react";
import type { FlatTreeNode } from "../../types";
import type { VaultContextMenuApi } from "../useVaultContextMenu";
import type { VaultSelectionApi } from "../useVaultSelection";
import type { VaultNoteController } from "./types";

export interface TreeEventsDeps {
  editor: VaultNoteController;
  onFileOpen?: (node: FlatTreeNode, mode: "preview" | "pinned") => void;
  selection: VaultSelectionApi;
  visibleNodes: FlatTreeNode[];
  toggleFolder: (relPath: string) => void;
  contextMenu: VaultContextMenuApi;
  setFocusedNode: Dispatch<SetStateAction<FlatTreeNode | null>>;
  lastFileClickRef: RefObject<{ path: string; atMs: number } | null>;
}

export interface TreeEvents {
  onTreeFileClick: (node: FlatTreeNode, e: UIEvent) => void;
  onTreeFolderToggle: (node: FlatTreeNode, e: UIEvent) => void;
  onTreeContextMenu: (node: FlatTreeNode, e: ReactMouseEvent) => void;
  onTreeBackgroundContextMenu: (e: ReactMouseEvent) => void;
}

/** Direct tree-row event handlers: click (with the Obsidian double-click →
 * pinned open), folder toggle, row + background context menus. */
export function createTreeEvents(deps: TreeEventsDeps): TreeEvents {
  const {
    editor,
    onFileOpen,
    selection,
    visibleNodes,
    toggleFolder,
    contextMenu,
    setFocusedNode,
    lastFileClickRef,
  } = deps;

  const onTreeFileClick = (node: FlatTreeNode, e: UIEvent) => {
    setFocusedNode(node);
    selection.handleSelect(
      {
        id: node.path,
        name: node.name,
        isFolder: node.kind === "folder",
        depth: node.depth,
      },
      {
        metaKey: (e as ReactMouseEvent).metaKey,
        ctrlKey: (e as ReactMouseEvent).ctrlKey,
        shiftKey: (e as ReactMouseEvent).shiftKey,
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
  };

  const onTreeFolderToggle = (node: FlatTreeNode, e: UIEvent) => {
    setFocusedNode(node);
    selection.handleSelect(
      {
        id: node.path,
        name: node.name,
        isFolder: true,
        depth: node.depth,
      },
      {
        metaKey: (e as ReactMouseEvent).metaKey,
        ctrlKey: (e as ReactMouseEvent).ctrlKey,
        shiftKey: (e as ReactMouseEvent).shiftKey,
      },
      visibleNodes,
    );
    toggleFolder(node.relPath);
  };

  const onTreeContextMenu = (node: FlatTreeNode, e: ReactMouseEvent) => {
    setFocusedNode(node);
    const isMultiSelect =
      selection.selectedIds.size > 1 && selection.selectedIds.has(node.path);
    if (!selection.selectedIds.has(node.path)) {
      selection.setSelection(new Set([node.path]));
    }
    selection.setFocusedId(node.path);
    contextMenu.openForNode(node, e, isMultiSelect);
  };

  const onTreeBackgroundContextMenu = (e: ReactMouseEvent) => {
    contextMenu.openForRoot(e);
  };

  return {
    onTreeFileClick,
    onTreeFolderToggle,
    onTreeContextMenu,
    onTreeBackgroundContextMenu,
  };
}
