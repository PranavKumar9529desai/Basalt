import type { FC, MouseEvent } from "react";
import { cn } from "@workspace/ui/lib/utils";

export interface ResizeHandleProps {
    onMouseDown: (e: MouseEvent) => void;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ onMouseDown }) => {
    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Resize handle is strictly a visual/mouse interaction overlay.
        <div
            onMouseDown={onMouseDown}
            className={cn(
                "absolute right-[-2px] top-0 bottom-0 w-1.5 cursor-col-resize z-10 pointer-events-auto bg-transparent",
            )}
        />
    );
};
