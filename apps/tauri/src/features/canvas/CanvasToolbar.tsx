// CanvasToolbar — floating bottom bar for canvas actions.
// React component; lives in the canvas leaf but is pure UI (no IPC).

import {
  IconLayoutGrid,
  IconNote,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
  IconBorderCornerRounded,
  IconColorPicker,
} from "@tabler/icons-react";
import { useState, useRef, useEffect } from "react";

export interface CanvasToolbarProps {
  onAddTextCard: () => void;
  onAddNote: () => void;
  onDeleteSelection: () => void;
  onGroupSelection: () => void;
  onZoomToFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

// ─── Color palette ──────────────────────────────────────────────────────────

const COLORS = [
  { id: "none", label: "No color", value: "transparent" },
  { id: "1", label: "Red", value: "#e33" },
  { id: "2", label: "Orange", value: "#e88" },
  { id: "3", label: "Yellow", value: "#ee3" },
  { id: "4", label: "Green", value: "#3a3" },
  { id: "5", label: "Cyan", value: "#3bb" },
  { id: "6", label: "Purple", value: "#a4e" },
  { id: "7", label: "Pink", value: "#e6a" },
];

// ─── Toolbar button ─────────────────────────────────────────────────────────

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors
        text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]
        ${disabled ? "opacity-40 pointer-events-none" : ""}
        ${className ?? ""}
      `}
    >
      <Icon size={18} stroke={1.5} />
    </button>
  );
}

// ─── Color picker popover ───────────────────────────────────────────────────

function ColorPicker({
  onColor,
  onClose,
}: {
  onColor: (colorId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-lg border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] p-2 shadow-lg"
    >
      {COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.label}
          aria-label={`Set color: ${c.label}`}
          onClick={() => {
            onColor(c.id);
            onClose();
          }}
          className="h-6 w-6 rounded-full border-2 border-[var(--sat-layout-border)] transition-transform hover:scale-110"
          style={
            c.id === "none"
              ? {
                  background:
                    "linear-gradient(135deg, #fff 45%, transparent 45%, transparent 55%, #fff 55%)",
                  backgroundSize: "8px 8px",
                }
              : { background: c.value }
          }
        />
      ))}
    </div>
  );
}

// ─── Main toolbar ───────────────────────────────────────────────────────────

export function CanvasToolbar({
  onAddTextCard,
  onAddNote,
  onDeleteSelection,
  onGroupSelection,
  onZoomToFit,
  onZoomIn,
  onZoomOut,
}: CanvasToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 rounded-xl border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]/90 px-2 py-1.5 shadow-lg backdrop-blur-sm">
      {/* Add actions */}
      <ToolButton
        icon={IconLayoutGrid}
        label="Add text card (Dbl-click)"
        onClick={onAddTextCard}
      />
      <ToolButton
        icon={IconNote}
        label="Add note from vault"
        onClick={onAddNote}
      />

      <div className="mx-1 h-5 w-px bg-[var(--sat-layout-border)]" />

      {/* Color */}
      <div className="relative">
        <ToolButton
          icon={IconColorPicker}
          label="Card color"
          onClick={() => setColorOpen(!colorOpen)}
        />
        {colorOpen && (
          <ColorPicker
            onColor={(id) => {
              void id;
              // TODO: apply color to selected nodes via scene mutation
            }}
            onClose={() => setColorOpen(false)}
          />
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-[var(--sat-layout-border)]" />

      {/* Edit actions */}
      <ToolButton
        icon={IconBorderCornerRounded}
        label="Group selection (⌘⇧G)"
        onClick={onGroupSelection}
      />
      <ToolButton
        icon={IconTrash}
        label="Delete selection (Del)"
        onClick={onDeleteSelection}
      />

      <div className="mx-1 h-5 w-px bg-[var(--sat-layout-border)]" />

      {/* Zoom */}
      <ToolButton icon={IconZoomIn} label="Zoom in" onClick={onZoomIn} />
      <ToolButton icon={IconZoomOut} label="Zoom out" onClick={onZoomOut} />
      <ToolButton
        icon={IconZoomReset}
        label="Zoom to fit"
        onClick={onZoomToFit}
      />
    </div>
  );
}
