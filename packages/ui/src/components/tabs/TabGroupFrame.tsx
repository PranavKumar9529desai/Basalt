import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, ReactNode } from "react";
import { type TabSplitDirection, TabSplitDropZone } from "./TabSplitDropZone";

export interface TabGroupFrameProps {
  tabsBar: ReactNode;
  children: ReactNode;
  className?: string;
  showSplitTargets?: boolean;
  activeSplitTarget?: TabSplitDirection | null;
  onSplitTargetDragEnter?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onSplitTargetDragOver?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onSplitTargetDragLeave?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onSplitTargetDrop?: (
    direction: TabSplitDirection,
    event: DragEvent<HTMLDivElement>,
  ) => void;
}

export function TabGroupFrame({
  tabsBar,
  children,
  className,
  showSplitTargets = false,
  activeSplitTarget = null,
  onSplitTargetDragEnter,
  onSplitTargetDragOver,
  onSplitTargetDragLeave,
  onSplitTargetDrop,
}: TabGroupFrameProps) {
  return (
    <section
      className={cn(
        "relative flex flex-1 min-h-0 min-w-0 flex-col border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]",
        className,
      )}
    >
      {tabsBar}
      <div className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
        {showSplitTargets ? (
          <div className="pointer-events-none absolute inset-0 z-20">
            <TabSplitDropZone
              direction="left"
              active={activeSplitTarget === "left"}
              onDragEnter={onSplitTargetDragEnter}
              onDragOver={onSplitTargetDragOver}
              onDragLeave={onSplitTargetDragLeave}
              onDrop={onSplitTargetDrop}
            />
            <TabSplitDropZone
              direction="right"
              active={activeSplitTarget === "right"}
              onDragEnter={onSplitTargetDragEnter}
              onDragOver={onSplitTargetDragOver}
              onDragLeave={onSplitTargetDragLeave}
              onDrop={onSplitTargetDrop}
            />
            <TabSplitDropZone
              direction="top"
              active={activeSplitTarget === "top"}
              onDragEnter={onSplitTargetDragEnter}
              onDragOver={onSplitTargetDragOver}
              onDragLeave={onSplitTargetDragLeave}
              onDrop={onSplitTargetDrop}
            />
            <TabSplitDropZone
              direction="bottom"
              active={activeSplitTarget === "bottom"}
              onDragEnter={onSplitTargetDragEnter}
              onDragOver={onSplitTargetDragOver}
              onDragLeave={onSplitTargetDragLeave}
              onDrop={onSplitTargetDrop}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
