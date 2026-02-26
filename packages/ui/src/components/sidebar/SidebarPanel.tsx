import React, { useState, useEffect, useRef } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { ResizeHandle } from "./ResizeHandle";

export interface SidebarPanelProps {
    children: React.ReactNode;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    collapsed?: boolean;
    onWidthChange?: (width: number) => void;
    className?: string;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({
    children,
    defaultWidth = 240,
    minWidth = 160,
    maxWidth,
    collapsed = false,
    onWidthChange,
    className,
}) => {
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            if (panelRef.current) {
                const panelRect = panelRef.current.getBoundingClientRect();
                let newWidth = e.clientX - panelRect.left;

                // Use provided maxWidth or dynamically calculate minimum 300px space for the editor
                const computedMaxWidth = maxWidth ?? Math.max(minWidth, window.innerWidth - 300);
                newWidth = Math.max(minWidth, Math.min(newWidth, computedMaxWidth));

                setWidth(newWidth);
                onWidthChange?.(newWidth);
            }
        };

        const handleMouseUp = () => {
            if (isResizing) setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "col-resize";
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "";
        };
    }, [isResizing, minWidth, maxWidth, onWidthChange]);

    if (collapsed) {
        return null;
    }

    return (
        <div
            ref={panelRef}
            style={{ width: `${width}px` }}
            className={cn(
                "group relative flex flex-col shrink-0 h-full bg-[var(--sat-surface-2)] border-r border-[var(--sat-layout-border)]",
                className
            )}
        >
            {children}
            <ResizeHandle
                onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault();
                    setIsResizing(true);
                }}
            />
        </div>
    );
};
