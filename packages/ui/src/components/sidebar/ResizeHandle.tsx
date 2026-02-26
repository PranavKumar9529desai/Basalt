import type { FC, MouseEvent } from "react";
import { cn } from "@workspace/ui/lib/utils";

export interface ResizeHandleProps {
  onMouseDown: (e: MouseEvent) => void;
  isResizing?: boolean;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({
  onMouseDown,
  isResizing = false,
}) => {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Resize handle is strictly a visual/mouse interaction overlay.
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "absolute right-[-2px] top-0 bottom-0 w-[2px] cursor-col-resize z-10 pointer-events-auto transition-colors duration-150",
        isResizing
          ? "bg-[var(--sat-accent-primary)]"
          : "bg-transparent hover:bg-[var(--sat-accent-primary)]",
      )}
    />
  );
};
