import {
  IconArrowRight,
  IconCopy,
  IconCut,
  IconFilePlus,
  IconFolderPlus,
  IconPencil,
  IconTrash,
  IconWindow,
} from "@tabler/icons-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu";
import { useMemo } from "react";

export type FileTreeContextTargetKind = "file" | "folder" | "root";

export interface FileTreeContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  targetKind: FileTreeContextTargetKind | null;
  isMultiSelect: boolean;
  canPaste: boolean;
  onOpenChange: (open: boolean) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function FileTreeContextMenu({
  open,
  anchor,
  targetKind,
  isMultiSelect,
  canPaste,
  onOpenChange,
  onNewNote,
  onNewFolder,
  onCut,
  onPaste,
  onRename,
  onDelete,
}: FileTreeContextMenuProps) {
  const menuAnchor = useMemo(() => {
    if (!anchor) return null;
    return {
      getBoundingClientRect: () => new DOMRect(anchor.x, anchor.y, 0, 0),
    };
  }, [anchor]);

  const isRoot = targetKind === "root";
  const isNote = targetKind === "file";
  const canCreate = targetKind !== null;

  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      {open && targetKind && (
        <ContextMenuContent anchor={menuAnchor} className="ring-0 p-4">
          {isMultiSelect ? (
            <>
              <ContextMenuItem disabled={isRoot} onClick={onCut}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconCut size={14} />
                </span>
                Cut
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isRoot}
                onClick={onDelete}
                variant="destructive"
              >
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconTrash size={14} />
                </span>
                Delete
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem disabled={!canCreate} onClick={onNewNote}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconFilePlus size={14} />
                </span>
                New Note
              </ContextMenuItem>
              <ContextMenuItem disabled={!canCreate} onClick={onNewFolder}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconFolderPlus size={14} />
                </span>
                New Folder
              </ContextMenuItem>

              <ContextMenuSeparator />

              <ContextMenuItem disabled={isRoot} onClick={onCut}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconCut size={14} />
                </span>
                Cut
              </ContextMenuItem>
              <ContextMenuItem disabled={isNote || !canPaste} onClick={onPaste}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconCopy size={14} />
                </span>
                Paste
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isRoot}
                onClick={onDelete}
                variant="destructive"
              >
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconTrash size={14} />
                </span>
                Delete
              </ContextMenuItem>

              <ContextMenuSeparator />

              <ContextMenuItem disabled>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconArrowRight size={14} />
                </span>
                Open to the Side
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconWindow size={14} />
                </span>
                Open in New Window
              </ContextMenuItem>
              <ContextMenuItem disabled={isRoot} onClick={onRename}>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconPencil size={14} />
                </span>
                Rename
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconCopy size={14} />
                </span>
                Copy Path
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <span className="inline-flex min-w-4 items-center justify-center">
                  <IconWindow size={14} />
                </span>
                Reveal in Explorer
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
