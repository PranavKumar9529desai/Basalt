import { IconX } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, MouseEvent } from "react";
import type { TabItemData } from "./types";

export interface TabItemProps {
  tab: TabItemData;
  elementRef?: (el: HTMLDivElement | null) => void;
  onSelect?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onPinToggle?: (tabId: string) => void;
  onContextMenu?: (tabId: string, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDragOver?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDrop?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (tabId: string, event: DragEvent<HTMLElement>) => void;
  showDropIndicator?: "left" | "right";
  className?: string;
}

export function TabItem({
  tab,
  elementRef,
  onSelect,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  showDropIndicator,
  className,
}: TabItemProps) {
  const canClose = tab.canClose ?? true;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            ref={elementRef}
            role="tab"
            tabIndex={tab.disabled ? -1 : 0}
            aria-selected={tab.isActive}
            data-active={tab.isActive ? "true" : "false"}
            data-preview={tab.isPreview ? "true" : "false"}
            className={cn(
              "group/item relative flex items-center gap-1 rounded-t-lg border border-b-0 px-1.5 py-1 transition-colors select-none",
              tab.isActive
                ? "z-20 border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]"
                : "border-transparent bg-transparent hover:bg-[var(--sat-surface-3)]/70",
              className,
            )}
            onContextMenu={(event) => onContextMenu?.(tab.id, event)}
            draggable={!tab.disabled}
            onDragStart={(event) => onDragStart?.(tab.id, event)}
            onDragEnter={(event) => {
              event.preventDefault();
              onDragOver?.(tab.id, event);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              onDragOver?.(tab.id, event);
            }}
            onDrop={(event) => onDrop?.(tab.id, event)}
            onDragEnd={(event) => onDragEnd?.(tab.id, event)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!tab.disabled) {
                  onSelect?.(tab.id);
                }
              }
            }}
            onClick={() => {
              if (!tab.disabled) {
                onSelect?.(tab.id);
              }
            }}
          />
        }
      >
        {showDropIndicator === "left" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--sat-accent-primary)] z-30"
          />
        )}
        {showDropIndicator === "right" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--sat-accent-primary)] z-30"
          />
        )}
        <div
          data-disabled={tab.disabled ? "true" : undefined}
          className={cn(
            "flex h-7 min-w-[170px] max-w-[300px] flex-1 items-center justify-start gap-1 rounded-sm border border-transparent px-2 transition-colors",
            tab.isActive
              ? "text-[var(--sat-text-primary)]"
              : "text-[var(--sat-text-secondary)] opacity-85 hover:opacity-100",
            tab.isPreview && "italic",
            tab.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {tab.icon}
          <span className="truncate text-xs max-w-[180px]">{tab.title}</span>
          {tab.isDirty ? (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--sat-accent-primary)]"
            />
          ) : null}
        </div>

        {canClose && tab.isActive ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            draggable={false}
            className="text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-2)] hover:text-[var(--sat-text-primary)] z-10"
            onClick={(event) => {
              event.stopPropagation();
              onClose?.(tab.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Close tab"
            title="Close tab"
          >
            <IconX size={12} />
          </Button>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span>{tab.title}</span>
      </TooltipContent>
    </Tooltip>
  );
}
