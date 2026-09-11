import {
  IconArrowRight,
  IconBrackets,
  IconCopy,
  IconCut,
  IconFilePlus,
  IconFolderPlus,
  IconLink,
  IconMarkdown,
  IconPencil,
  IconTrash,
  IconWindow,
} from "@tabler/icons-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu";
import { useMemo } from "react";
import type { ReactNode } from "react";

function ContextMenuItemIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-4 items-center justify-center">
      {children}
    </span>
  );
}

export type FileTreeContextTargetKind = "file" | "folder" | "root";

/** Copy As formats offered in the file-tree context menu. */
export type CopyAsFormat = "wikilink" | "markdown" | "path" | "url";

const COPY_AS_ITEMS: Array<{
  format: CopyAsFormat;
  label: string;
  icon: ReactNode;
}> = [
  {
    format: "wikilink",
    label: "Copy as Wikilink",
    icon: <IconBrackets size={14} />,
  },
  {
    format: "markdown",
    label: "Copy as Markdown",
    icon: <IconMarkdown size={14} />,
  },
  { format: "path", label: "Copy as Path", icon: <IconCopy size={14} /> },
  { format: "url", label: "Copy as URL", icon: <IconLink size={14} /> },
];

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
  onCopyPath: () => void;
  onCopyAs: (format: CopyAsFormat) => void;
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
  onCopyPath,
  onCopyAs,
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
                <ContextMenuItemIcon>
                  <IconCut size={14} />
                </ContextMenuItemIcon>
                Cut
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isRoot}
                onClick={onDelete}
                variant="destructive"
              >
                <ContextMenuItemIcon>
                  <IconTrash size={14} />
                </ContextMenuItemIcon>
                Delete
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem disabled={!canCreate} onClick={onNewNote}>
                <ContextMenuItemIcon>
                  <IconFilePlus size={14} />
                </ContextMenuItemIcon>
                New Note
              </ContextMenuItem>
              <ContextMenuItem disabled={!canCreate} onClick={onNewFolder}>
                <ContextMenuItemIcon>
                  <IconFolderPlus size={14} />
                </ContextMenuItemIcon>
                New Folder
              </ContextMenuItem>

              <ContextMenuSeparator />

              <ContextMenuItem disabled={isRoot} onClick={onCut}>
                <ContextMenuItemIcon>
                  <IconCut size={14} />
                </ContextMenuItemIcon>
                Cut
              </ContextMenuItem>
              <ContextMenuItem disabled={isNote || !canPaste} onClick={onPaste}>
                <ContextMenuItemIcon>
                  <IconCopy size={14} />
                </ContextMenuItemIcon>
                Paste
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isRoot}
                onClick={onDelete}
                variant="destructive"
              >
                <ContextMenuItemIcon>
                  <IconTrash size={14} />
                </ContextMenuItemIcon>
                Delete
              </ContextMenuItem>

              <ContextMenuSeparator />

              <ContextMenuItem disabled>
                <ContextMenuItemIcon>
                  <IconArrowRight size={14} />
                </ContextMenuItemIcon>
                Open to the Side
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <ContextMenuItemIcon>
                  <IconWindow size={14} />
                </ContextMenuItemIcon>
                Open in New Window
              </ContextMenuItem>
              <ContextMenuItem disabled={isRoot} onClick={onRename}>
                <ContextMenuItemIcon>
                  <IconPencil size={14} />
                </ContextMenuItemIcon>
                Rename
              </ContextMenuItem>
              <ContextMenuItem disabled={isRoot} onClick={onCopyPath}>
                <ContextMenuItemIcon>
                  <IconCopy size={14} />
                </ContextMenuItemIcon>
                Copy Path
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger disabled={isRoot}>
                  <ContextMenuItemIcon>
                    <IconCopy size={14} />
                  </ContextMenuItemIcon>
                  Copy As
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {COPY_AS_ITEMS.map(({ format, label, icon }) => (
                    <ContextMenuItem
                      key={format}
                      onClick={() => onCopyAs(format)}
                    >
                      <ContextMenuItemIcon>{icon}</ContextMenuItemIcon>
                      {label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem disabled>
                <ContextMenuItemIcon>
                  <IconWindow size={14} />
                </ContextMenuItemIcon>
                Reveal in Explorer
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
