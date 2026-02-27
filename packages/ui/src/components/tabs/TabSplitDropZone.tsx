import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent } from "react";

export type TabSplitDirection = "left" | "right" | "top" | "bottom";

export interface TabSplitDropZoneProps {
  direction: TabSplitDirection;
  active?: boolean;
  onDragEnter?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onDragOver?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onDragLeave?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onDrop?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
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
  const geometryClass = active
    ? direction === "left"
      ? "inset-y-0 left-0 w-1/2"
      : direction === "right"
        ? "inset-y-0 right-0 w-1/2"
        : direction === "top"
          ? "inset-x-0 top-0 h-1/2"
          : "inset-x-0 bottom-0 h-1/2"
    : direction === "left"
      ? "top-12 bottom-12 left-2 w-12"
      : direction === "right"
        ? "top-12 bottom-12 right-2 w-12"
        : direction === "top"
          ? "inset-x-2 top-2 h-10"
          : "inset-x-2 bottom-2 h-10";

  const roundingClass = active
    ? direction === "left"
      ? "rounded-l-md"
      : direction === "right"
        ? "rounded-r-md"
        : direction === "top"
          ? "rounded-t-md"
          : "rounded-b-md"
    : "rounded-md";

  return (
    <div
      aria-hidden="true"
      data-direction={direction}
      data-tab-split-zone="true"
      className={cn(
        "pointer-events-auto absolute border border-[var(--sat-layout-border)] bg-[var(--sat-surface-3)]/60 transition-all duration-150 ease-out",
        active &&
          "border-[var(--sat-accent-primary)] bg-[color-mix(in_srgb,var(--sat-accent-primary)_18%,transparent)]",
        // Keep inactive hit-targets above the active preview overlay so switching targets remains easy.
        active ? "z-10" : "z-20",
        roundingClass,
        geometryClass,
        className,
      )}
      onDragEnter={(event) => onDragEnter?.(direction, event)}
      onDragOver={(event) => onDragOver?.(direction, event)}
      onDragLeave={(event) => onDragLeave?.(direction, event)}
      onDrop={(event) => onDrop?.(direction, event)}
      onWheel={(event) => {
        if (import.meta.env.DEV) {
          console.debug("[tab-split-zone] wheel intercepted", {
            direction,
            active: Boolean(active),
            defaultPrevented: event.defaultPrevented,
          });
        }
      }}
    />
  );
}
