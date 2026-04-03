import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent } from "react";

export type TabSplitDirection = "left" | "right" | "top" | "bottom" | "center";

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
          : direction === "bottom"
            ? "inset-x-0 bottom-0 h-1/2"
            : "inset-0"
    : direction === "left"
      ? "top-8 bottom-8 left-0 w-16"
      : direction === "right"
        ? "top-8 bottom-8 right-0 w-16"
        : direction === "top"
          ? "inset-x-8 top-0 h-14"
          : direction === "bottom"
            ? "inset-x-8 bottom-0 h-14"
            : "inset-16";

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
      onDragEnter={(event) => {
        console.log("[ZONE] dragenter", direction);
        onDragEnter?.(direction, event);
      }}
      onDragOver={(event) => {
        console.log("[ZONE] dragover", direction);
        onDragOver?.(direction, event);
      }}
      onDragLeave={(event) => onDragLeave?.(direction, event)}
      onDrop={(event) => {
        console.log("[ZONE] drop", direction);
        onDrop?.(direction, event);
      }}
    />
  );
}
