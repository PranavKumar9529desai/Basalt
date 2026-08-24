import { cn } from "@workspace/ui/lib/utils";
import React, { useEffect, useRef, useState } from "react";
import { ResizeHandle } from "./ResizeHandle";

export interface SidebarPanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsed?: boolean;
  /** Which edge the panel sits on. Controls resize-handle placement and border. */
  side?: "left" | "right";
  onWidthChange?: (width: number) => void;
  className?: string;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({
  children,
  defaultWidth = 240,
  minWidth = 160,
  maxWidth,
  collapsed = false,
  side = "left",
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
        const newWidth =
          side === "right"
            ? panelRect.right - e.clientX
            : e.clientX - panelRect.left;

        // Use provided maxWidth or dynamically calculate minimum 300px space for the editor
        const computedMaxWidth =
          maxWidth ?? Math.max(minWidth, window.innerWidth - 300);
        const clamped = Math.max(
          minWidth,
          Math.min(newWidth, computedMaxWidth),
        );

        setWidth(clamped);
        onWidthChange?.(clamped);
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
  }, [isResizing, minWidth, maxWidth, onWidthChange, side]);

  if (collapsed) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      style={{ width: `${width}px` }}
      className={cn(
        "group relative flex flex-col shrink-0 h-full bg-[var(--sat-surface-2)]",
        side === "right"
          ? "border-l border-[var(--sat-layout-border)]"
          : "border-r border-[var(--sat-layout-border)]",
        className,
      )}
    >
      {children}
      <ResizeHandle
        side={side}
        isResizing={isResizing}
        onMouseDown={(e: React.MouseEvent) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      />
    </div>
  );
};
