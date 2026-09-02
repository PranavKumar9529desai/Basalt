import { SidebarActionButtons } from "@workspace/ui/components/sidebar";
import { IconFilePlus, IconFolderPlus } from "@tabler/icons-react";
import { FileTree } from "../../features/vault";
import { useAppContext } from "../AppProvider";

/**
 * File explorer view — the left dock's registered view.
 * Self-contained: reads the workspace context instead of receiving
 * prop drills from the shell.
 */
export function FileExplorer() {
  const { visibleNodes, openFolders, controller, mutations, selection } =
    useAppContext();

  return (
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
    />
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
