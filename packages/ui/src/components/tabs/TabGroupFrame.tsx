import { cn } from "@workspace/ui/lib/utils";
import type { DragEvent, ReactNode } from "react";
import { type TabSplitDirection, TabSplitDropZone } from "./TabSplitDropZone";

/**
 * Computes which split zone the cursor is in based on distance to each edge.
 * The closest edge wins; if no edge is within edgePx the result is "center".
 */
function getDropDirection(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): TabSplitDirection {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const dLeft = x;
  const dRight = rect.width - x;
  const dTop = y;
  const dBottom = rect.height - y;
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  const edgePx = 80;
  if (min > edgePx) return "center";
  if (min === dLeft) return "left";
  if (min === dRight) return "right";
  if (min === dTop) return "top";
  return "bottom";
}

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
      onDragOver={(e) => {
        // Always call preventDefault so WKWebView registers this section as a
        // drop target. In WKWebView, dataTransfer.types is empty for same-page
        // drags during dragover, so we cannot filter by type here — if we don't
        // call preventDefault unconditionally, WKWebView stops sending drag events.
        e.preventDefault();
        console.log("[SECTION] dragover", { showSplitTargets, types: [...e.dataTransfer.types] });
        if (!showSplitTargets) return;
        const dir = getDropDirection(
          e.clientX,
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        );
        console.log("[SECTION] computed dir →", dir);
        onSplitTargetDragOver?.(dir, e as unknown as DragEvent<HTMLDivElement>);
      }}
      onDrop={(e) => {
        console.log("[SECTION] drop", { showSplitTargets });
        e.preventDefault();
        if (!showSplitTargets) return;
        const dir = getDropDirection(
          e.clientX,
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        );
        console.log("[SECTION] drop dir →", dir);
        onSplitTargetDrop?.(dir, e as unknown as DragEvent<HTMLDivElement>);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        console.log("[SECTION] dragleave — exited pane");
        onSplitTargetDragLeave?.(
          "center",
          e as unknown as DragEvent<HTMLDivElement>,
        );
      }}
    >
      {tabsBar}
      <div className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
        {/* Visual-only overlay — pointer-events-none so normal editor interaction
            is never blocked. Zone highlights update via activeSplitTarget prop. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10",
            !showSplitTargets && "opacity-0",
          )}
        >
          <TabSplitDropZone direction="center" active={activeSplitTarget === "center"} />
          <TabSplitDropZone direction="left" active={activeSplitTarget === "left"} />
          <TabSplitDropZone direction="right" active={activeSplitTarget === "right"} />
          <TabSplitDropZone direction="top" active={activeSplitTarget === "top"} />
          <TabSplitDropZone direction="bottom" active={activeSplitTarget === "bottom"} />
        </div>
      </div>
    </section>
  );
}
