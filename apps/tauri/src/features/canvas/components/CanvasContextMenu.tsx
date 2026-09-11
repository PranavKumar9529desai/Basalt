// CanvasContextMenu — right-click menu for canvas nodes, edges, and background.
// Pure React UI; calls into controller callbacks. Anchored at click
// coordinates via the ContextMenuContent `anchor` trick the editor uses.

import { useMemo } from "react";
import {
  IconLayoutGrid,
  IconNote,
  IconTrash,
  IconColorSwatch,
  IconEdit,
  IconBorderCornerRounded,
  IconClipboard,
  IconCopy,
} from "@tabler/icons-react";
import {
  ContextMenu as MenuRoot,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu";

export type ContextTarget =
  | { kind: "background"; wx: number; wy: number }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

export interface CanvasContextMenuProps {
  target: ContextTarget | null;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onAddTextCard: (wx: number, wy: number) => void;
  onDeleteSelection: () => void;
  onGroupSelection: () => void;
  onPaste?: () => void;
  onEditEdgeLabel?: (edgeId: string) => void;
}

export function CanvasContextMenu({
  target,
  anchor,
  onClose,
  onAddTextCard,
  onDeleteSelection,
  onGroupSelection,
  onPaste,
  onEditEdgeLabel,
}: CanvasContextMenuProps) {
  const menuAnchor = useMemo(() => {
    if (!anchor) return null;
    return {
      getBoundingClientRect: () => new DOMRect(anchor.x, anchor.y, 0, 0),
    };
  }, [anchor]);

  if (!target || !anchor) return null;

  return (
    <MenuRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ContextMenuContent anchor={menuAnchor} className="min-w-[180px]">
        {target.kind === "background" && (
          <>
            <ContextMenuItem
              onClick={() => {
                onAddTextCard(target.wx, target.wy);
                onClose();
              }}
            >
              <IconLayoutGrid size={15} stroke={1.5} />
              Add text card
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                // TODO: open note picker
                onClose();
              }}
            >
              <IconNote size={15} stroke={1.5} />
              Add note from vault
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                onPaste?.();
                onClose();
              }}
            >
              <IconClipboard size={15} stroke={1.5} />
              Paste
            </ContextMenuItem>
          </>
        )}

        {target.kind === "node" && (
          <>
            <ContextMenuItem
              onClick={() => {
                // TODO: open inline editor
                onClose();
              }}
            >
              <IconEdit size={15} stroke={1.5} />
              Edit
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                // TODO: open color picker
                onClose();
              }}
            >
              <IconColorSwatch size={15} stroke={1.5} />
              Change color
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                // TODO: duplicate node
                onClose();
              }}
            >
              <IconCopy size={15} stroke={1.5} />
              Duplicate
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                onGroupSelection();
                onClose();
              }}
            >
              <IconBorderCornerRounded size={15} stroke={1.5} />
              Group
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => {
                onDeleteSelection();
                onClose();
              }}
            >
              <IconTrash size={15} stroke={1.5} />
              Delete
            </ContextMenuItem>
          </>
        )}

        {target.kind === "edge" && (
          <>
            <ContextMenuItem
              onClick={() => {
                onEditEdgeLabel?.(target.id);
                onClose();
              }}
            >
              <IconEdit size={15} stroke={1.5} />
              Add label
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => {
                onDeleteSelection();
                onClose();
              }}
            >
              <IconTrash size={15} stroke={1.5} />
              Delete edge
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </MenuRoot>
  );
}
