import { SidebarActionButtons } from "@workspace/ui/components/sidebar";
import { IconFilePlus, IconFolderPlus } from "@tabler/icons-react";
import { useCallback } from "react";
import { FileTree, copyPathsAs } from "../../features/vault";
import { useAppContext } from "../../shared";
import { FileDragGhost, useFileDrag } from "../../shared/fileDnd";

/**
 * File explorer view — the left dock's registered view.
 * Self-contained: reads the workspace context instead of receiving
 * prop drills from the shell.
 */
export function FileExplorer() {
  const { visibleNodes, openFolders, controller, mutations, selection, vaultPath } =
    useAppContext();
  const { isDraggingFile, handleFilePointerDown } = useFileDrag();

  // Obsidian parity: Ctrl/Cmd+C in the tree copies the selected nodes'
  // vault-relative paths to the OS clipboard.
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "c") return;
      const selectedNodes = visibleNodes.filter((n) =>
        selection.selectedIds.has(n.path),
      );
      if (selectedNodes.length === 0) return;
      e.preventDefault();
      void copyPathsAs(
        "path",
        selectedNodes.map((n) => ({ relPath: n.relPath, name: n.name })),
        vaultPath,
      );
    },
    [visibleNodes, selection.selectedIds, vaultPath],
  );

  return (
    <div onKeyDownCapture={handleTreeKeyDown} className="contents">
      <FileTree
        visibleNodes={visibleNodes}
        openFolders={openFolders}
        selectedIds={selection.selectedIds}
        cutIds={controller.cutIds}
        onFileClick={controller.onTreeFileClick}
        onFolderToggle={controller.onTreeFolderToggle}
        onContextMenu={controller.onTreeContextMenu}
        onBackgroundContextMenu={controller.onTreeBackgroundContextMenu}
        ghostNode={mutations.ghostNode}
        onCommitEdit={controller.handleCommitEdit}
        onCancelEdit={controller.handleCancelEdit}
        renamingNode={mutations.renamingNode}
        onCommitRename={controller.handleCommitRename}
        onCancelRename={controller.handleCancelRename}
        onDragStart={handleFilePointerDown}
      />
      {isDraggingFile && <FileDragGhost />}
    </div>
  );
}

/**
 * Header actions for the file explorer, rendered inside the dock's
 * header band while this view is active.
 */
export function FileExplorerHeaderActions() {
  const { controller } = useAppContext();

  const actions = [
    {
      id: "new-note",
      icon: <IconFilePlus size={16} stroke={1.5} />,
      label: "New note",
      onClick: controller.createNoteInstant,
    },
    {
      id: "new-folder",
      icon: <IconFolderPlus size={16} stroke={1.5} />,
      label: "New folder",
      onClick: controller.startFolderInline,
    },
  ];

  return <SidebarActionButtons actions={actions} />;
}
