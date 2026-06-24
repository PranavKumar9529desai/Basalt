import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import {
  FileTreeContextMenu,
  type FileTreeContextTargetKind,
} from "@workspace/ui/components/file-tree";
import { QuickSwitcher, SearchModal } from "../features/search";
import { SettingsModal } from "../features/settings";

interface WorkspaceOverlaysProps {
  contextMenu: {
    isOpen: boolean;
    menuState: {
      anchor: { x: number; y: number } | null;
      target: { kind: FileTreeContextTargetKind } | null;
    };
    closeMenu: () => void;
  };
  mutations: {
    isDeleteConfirmOpen: boolean;
    setDeleteConfirmOpen: (open: boolean) => void;
    pendingDeletePaths: string[];
    pendingDeleteName: string;
    isLoading: boolean;
  };
  controller: {
    isMultiSelectContextMenu: boolean;
    canPasteToMenuTarget: boolean;
    onMenuNewNote: () => void;
    onMenuNewFolder: () => void;
    onMenuCut: () => void;
    onMenuPaste: () => Promise<void>;
    onMenuDelete: () => void;
  };
  onConfirmDelete: () => void;
  onSearchOpen: (path: string) => void;
}

export function WorkspaceOverlays({
  contextMenu,
  mutations,
  controller,
  onConfirmDelete,
  onSearchOpen,
}: WorkspaceOverlaysProps) {
  return (
    <>
      <FileTreeContextMenu
        open={contextMenu.isOpen}
        anchor={contextMenu.menuState.anchor}
        targetKind={contextMenu.menuState.target?.kind ?? null}
        isMultiSelect={controller.isMultiSelectContextMenu}
        canPaste={controller.canPasteToMenuTarget}
        onOpenChange={(open) => {
          if (!open) contextMenu.closeMenu();
        }}
        onNewNote={controller.onMenuNewNote}
        onNewFolder={controller.onMenuNewFolder}
        onCut={controller.onMenuCut}
        onPaste={controller.onMenuPaste}
        onDelete={controller.onMenuDelete}
      />

      <ConfirmDialog
        open={mutations.isDeleteConfirmOpen}
        onOpenChange={mutations.setDeleteConfirmOpen}
        title={
          mutations.pendingDeletePaths.length > 1
            ? "Delete selected items"
            : "Delete note"
        }
        description={
          mutations.pendingDeletePaths.length > 1
            ? `Permanently delete ${mutations.pendingDeletePaths.length} selected items? This cannot be undone.`
            : `Permanently delete "${mutations.pendingDeleteName}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={onConfirmDelete}
        isLoading={mutations.isLoading}
      />

      <SearchModal onOpen={onSearchOpen} />
      <QuickSwitcher onOpen={onSearchOpen} />
      <SettingsModal />
    </>
  );
}
