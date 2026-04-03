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
      onDragOver={() => console.log("[SECTION] dragover")}
      onDragEnter={() => console.log("[SECTION] dragenter")}
    >
      {tabsBar}
      <div className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
        {/*
          Always in the DOM — WebKit (Tauri) snapshots drop targets at dragstart.
          If the overlay is conditionally mounted AFTER dragstart fires, WebKit
          never registers it as a valid drop target and no drag events reach it.
          We hide it visually when inactive and guard handlers so it has no effect
          during non-tab drags (e.g. file drops, text selection drags).
        */}
        <div
          className={cn(
            "absolute inset-0 z-10",
            !showSplitTargets && "pointer-events-none opacity-0",
          )}
          onDragOver={(e) => {
            if (!showSplitTargets) return;
            console.log("[INTERCEPTOR] dragover");
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (!showSplitTargets) return;
            e.preventDefault();
          }}
        >
          <TabSplitDropZone
            direction="center"
            active={activeSplitTarget === "center"}
            onDragEnter={showSplitTargets ? onSplitTargetDragEnter : undefined}
            onDragOver={showSplitTargets ? onSplitTargetDragOver : undefined}
            onDragLeave={showSplitTargets ? onSplitTargetDragLeave : undefined}
            onDrop={showSplitTargets ? onSplitTargetDrop : undefined}
          />
          <TabSplitDropZone
            direction="left"
            active={activeSplitTarget === "left"}
            onDragEnter={showSplitTargets ? onSplitTargetDragEnter : undefined}
            onDragOver={showSplitTargets ? onSplitTargetDragOver : undefined}
            onDragLeave={showSplitTargets ? onSplitTargetDragLeave : undefined}
            onDrop={showSplitTargets ? onSplitTargetDrop : undefined}
          />
          <TabSplitDropZone
            direction="right"
            active={activeSplitTarget === "right"}
            onDragEnter={showSplitTargets ? onSplitTargetDragEnter : undefined}
            onDragOver={showSplitTargets ? onSplitTargetDragOver : undefined}
            onDragLeave={showSplitTargets ? onSplitTargetDragLeave : undefined}
            onDrop={showSplitTargets ? onSplitTargetDrop : undefined}
          />
          <TabSplitDropZone
            direction="top"
            active={activeSplitTarget === "top"}
            onDragEnter={showSplitTargets ? onSplitTargetDragEnter : undefined}
            onDragOver={showSplitTargets ? onSplitTargetDragOver : undefined}
            onDragLeave={showSplitTargets ? onSplitTargetDragLeave : undefined}
            onDrop={showSplitTargets ? onSplitTargetDrop : undefined}
          />
          <TabSplitDropZone
            direction="bottom"
            active={activeSplitTarget === "bottom"}
            onDragEnter={showSplitTargets ? onSplitTargetDragEnter : undefined}
            onDragOver={showSplitTargets ? onSplitTargetDragOver : undefined}
            onDragLeave={showSplitTargets ? onSplitTargetDragLeave : undefined}
            onDrop={showSplitTargets ? onSplitTargetDrop : undefined}
          />
        </div>
      </div>
    </section>
  );
}
