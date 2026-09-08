// CanvasContextMenu — right-click menu for canvas nodes, edges, and background.
// Pure React UI; calls into controller callbacks.

import { useEffect, useRef, useCallback } from "react";
import {
  IconLayoutGrid,
  IconNote,
  IconTrash,
  IconColorSwatch,
  IconEdit,
  IconBorderCornerRounded,
  IconCopy,
} from "@tabler/icons-react";

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
  onEditEdgeLabel?: (edgeId: string) => void;
}

// ─── Menu item ──────────────────────────────────────────────────────────────

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors
        ${
          danger
            ? "text-red-400 hover:bg-red-500/10"
            : "text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]"
        }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon size={15} stroke={1.5} />
      {label}
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function CanvasContextMenu({
  target,
  anchor,
  onClose,
  onAddTextCard,
  onDeleteSelection,
  onGroupSelection,
  onEditEdgeLabel,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!anchor) return;
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [anchor, handlePointerDown]);

  if (!target || !anchor) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] py-1 shadow-xl"
      style={{ left: anchor.x, top: anchor.y }}
    >
      {target.kind === "background" && (
        <>
          <MenuItem
            icon={IconLayoutGrid}
            label="Add text card"
            onClick={() => {
              onAddTextCard(target.wx, target.wy);
              onClose();
            }}
          />
          <MenuItem
            icon={IconNote}
            label="Add note from vault"
            onClick={() => {
              // TODO: open note picker
              onClose();
            }}
          />
          <div className="mx-2 my-1 h-px bg-[var(--sat-layout-border)]" />
          <MenuItem
            icon={IconCopy}
            label="Paste"
            onClick={() => {
              // TODO: paste from clipboard
              onClose();
            }}
          />
        </>
      )}

      {target.kind === "node" && (
        <>
          <MenuItem
            icon={IconEdit}
            label="Edit"
            onClick={() => {
              // TODO: open inline editor
              onClose();
            }}
          />
          <MenuItem
            icon={IconColorSwatch}
            label="Change color"
            onClick={() => {
              // TODO: open color picker
              onClose();
            }}
          />
          <MenuItem
            icon={IconCopy}
            label="Duplicate"
            onClick={() => {
              // TODO: duplicate node
              onClose();
            }}
          />
          <MenuItem
            icon={IconBorderCornerRounded}
            label="Group"
            onClick={() => {
              onGroupSelection();
              onClose();
            }}
          />
          <div className="mx-2 my-1 h-px bg-[var(--sat-layout-border)]" />
          <MenuItem
            icon={IconTrash}
            label="Delete"
            danger
            onClick={() => {
              onDeleteSelection();
              onClose();
            }}
          />
        </>
      )}

      {target.kind === "edge" && (
        <>
          <MenuItem
            icon={IconEdit}
            label="Add label"
            onClick={() => {
              onEditEdgeLabel?.(target.id);
              onClose();
            }}
          />
          <div className="mx-2 my-1 h-px bg-[var(--sat-layout-border)]" />
          <MenuItem
            icon={IconTrash}
            label="Delete edge"
            danger
            onClick={() => {
              onDeleteSelection();
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}
