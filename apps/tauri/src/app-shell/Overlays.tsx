import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import {
  FileTreeContextMenu,
  type FileTreeContextTargetKind,
} from "@workspace/ui/components/file-tree";
import { lazy, Suspense } from "react";
import type { PreviewDeps } from "../features/search";

// Overlay modals are lazy (ADR-020 move 3): none are visible at first paint,
// so their code (search UI, settings UI, dialog primitives) must not be in
// the startup bundle. Chunks load from disk in ~1ms on first open; we also
// idle-prefetch them after boot so even that latency disappears.
const QuickSwitcher = lazy(() =>
  import("../features/search").then((m) => ({ default: m.QuickSwitcher })),
);
const SearchModal = lazy(() =>
  import("../features/search").then((m) => ({ default: m.SearchModal })),
);
const SettingsModal = lazy(() =>
  import("../features/settings").then((m) => ({ default: m.SettingsModal })),
);
const ExportDialog = lazy(() =>
  import("../features/export").then((m) => ({ default: m.ExportDialog })),
);

interface OverlaysProps {
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
    onMenuRename: () => void;
    onMenuDelete: () => void;
  };
  onConfirmDelete: () => void;
  onSearchOpen: (path: string, line?: number) => void;
  previewDeps: PreviewDeps;
}

export function Overlays({
  contextMenu,
  mutations,
  controller,
  onConfirmDelete,
  onSearchOpen,
  previewDeps,
}: OverlaysProps) {
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
        onRename={controller.onMenuRename}
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

      <Suspense fallback={null}>
        <SearchModal onOpen={onSearchOpen} previewDeps={previewDeps} />
        <QuickSwitcher onOpen={onSearchOpen} />
        <SettingsModal />
        <ExportDialog previewDeps={previewDeps} />
      </Suspense>
    </>
  );
}
