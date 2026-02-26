import { IconPinned, IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent } from "react";
import type { TabItemData } from "./types";

export interface TabItemProps {
  tab: TabItemData;
  onSelect?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  className?: string;
}

export function TabItem({
  tab,
  onSelect,
  onClose,
  onPinToggle,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  className,
}: TabItemProps) {
  const canClose = tab.canClose ?? true;

  return (
    <div
      role="tab"
      tabIndex={tab.disabled ? -1 : 0}
      aria-selected={tab.isActive}
      data-active={tab.isActive ? "true" : "false"}
      data-preview={tab.isPreview ? "true" : "false"}
      className={cn(
        "group/item flex items-center gap-1 rounded-md border px-1 py-1 transition-colors",
        tab.isActive
          ? "border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]"
          : "border-transparent bg-transparent hover:bg-[var(--sat-surface-3)]",
        className,
      )}
      onContextMenu={(event) => onContextMenu?.(tab.id, event)}
      draggable={!tab.disabled}
      onDragStart={(event) => onDragStart?.(tab.id, event)}
      onDragOver={(event) => onDragOver?.(tab.id, event)}
      onDrop={(event) => onDrop?.(tab.id, event)}
      onDragEnd={(event) => onDragEnd?.(tab.id, event)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={tab.disabled}
        className={cn(
          "h-7 max-w-[220px] flex-1 justify-start gap-1 rounded-sm border border-transparent px-2 text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-2)]",
          !tab.isActive && "text-[var(--sat-text-secondary)]",
          tab.isPreview && "italic",
        )}
        onClick={() => onSelect?.(tab.id)}
      >
        {tab.icon}
        <span className="truncate text-xs">{tab.title}</span>
        {tab.isDirty ? (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--sat-accent-primary)]"
          />
        ) : null}
      </Button>

      {tab.isPinned ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)]"
          onClick={() => onPinToggle?.(tab.id)}
          aria-label="Unpin tab"
          title="Unpin tab"
        >
          <IconPinned size={12} />
        </Button>
      ) : null}

      {canClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)]"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.(tab.id);
          }}
          aria-label="Close tab"
          title="Close tab"
        >
          <IconX size={12} />
        </Button>
      ) : null}
    </div>
  );
}
