import { cn } from "@workspace/ui/lib/utils";
import type { FC, MouseEvent } from "react";

export interface ResizeHandleProps {
  onMouseDown: (e: MouseEvent) => void;
  isResizing?: boolean;
  /** Which edge the panel sits on — the handle hugs the child-facing edge. */
  side?: "left" | "right";
}

export const ResizeHandle: FC<ResizeHandleProps> = ({
  onMouseDown,
  isResizing = false,
  side = "left",
}) => {
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Resize handle is strictly a visual/mouse interaction overlay.
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "absolute top-0 bottom-0 w-[2px] cursor-col-resize z-10 pointer-events-auto transition-colors duration-150",
        side === "right" ? "left-[-2px]" : "right-[-2px]",
        isResizing
          ? "bg-[var(--sat-accent-primary)]"
          : "bg-transparent hover:bg-[var(--sat-accent-primary)]",
      )}
    />
  );
};
