// CanvasToolbar — floating bottom bar for canvas element creation.
// Matches Obsidian Canvas: focused purely on creating cards, notes, media, and groups.


import {
  IconFileText,
  IconNote,
  IconLink,
  IconBorderCornerRounded,
} from "@tabler/icons-react";

export interface CanvasToolbarProps {
  onAddTextCard: () => void;
  onAddNote: () => void;
  onAddLink: () => void;
  onAddGroup: () => void;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg transition-all
        text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)] hover:scale-105 active:scale-95"
    >
      <Icon size={20} stroke={1.5} />
    </button>
  );
}

export function CanvasToolbar({
  onAddTextCard,
  onAddNote,
  onAddLink,
  onAddGroup,
}: CanvasToolbarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-2xl border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]/90 px-2 py-1.5 shadow-xl backdrop-blur-md">
      <ToolButton
        icon={IconFileText}
        label="Add card (double-click canvas)"
        onClick={onAddTextCard}
      />
      <ToolButton
        icon={IconNote}
        label="Add note from vault"
        onClick={onAddNote}
      />
      <ToolButton
        icon={IconLink}
        label="Add web link"
        onClick={onAddLink}
      />
      <div className="mx-1 h-5 w-px bg-[var(--sat-layout-border)]" />
      <ToolButton
        icon={IconBorderCornerRounded}
        label="Add group"
        onClick={onAddGroup}
      />
    </div>
  );
}
