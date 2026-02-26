import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent } from "react";

export type TabSplitDirection = "left" | "right" | "top" | "bottom";

export interface TabSplitDropZoneProps {
  direction: TabSplitDirection;
  active?: boolean;
  onDragEnter?: (direction: TabSplitDirection, event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (direction: TabSplitDirection, event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (direction: TabSplitDirection, event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (direction: TabSplitDirection, event: DragEvent<HTMLDivElement>) => void;
  className?: string;
}

export function TabSplitDropZone({
  direction,
  active,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  className,
}: TabSplitDropZoneProps) {
  return (
    <div
      aria-hidden="true"
      data-direction={direction}
      className={cn(
        "pointer-events-auto absolute rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-3)]/60 transition-colors",
        active &&
          "border-[var(--sat-accent-primary)] bg-[color-mix(in_srgb,var(--sat-accent-primary)_22%,transparent)]",
        direction === "left" && "inset-y-2 left-2 w-12",
        direction === "right" && "inset-y-2 right-2 w-12",
        direction === "top" && "inset-x-2 top-2 h-10",
        direction === "bottom" && "inset-x-2 bottom-2 h-10",
        className,
      )}
      onDragEnter={(event) => onDragEnter?.(direction, event)}
      onDragOver={(event) => onDragOver?.(direction, event)}
      onDragLeave={(event) => onDragLeave?.(direction, event)}
      onDrop={(event) => onDrop?.(direction, event)}
    />
  );
}

