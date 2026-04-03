import { cn } from "@workspace/ui/lib/utils";
import { useRef, type DragEvent, type ReactNode } from "react";
import type { TabSplitDirection } from "./TabSplitDropZone";

/** Returns Tailwind geometry classes for the split preview overlay. */
function getSplitPreviewClass(direction: TabSplitDirection | null): string {
  switch (direction) {
    case "left":   return "inset-y-0 left-0 w-1/2 rounded-r-md";
    case "right":  return "inset-y-0 right-0 w-1/2 rounded-l-md";
    case "top":    return "inset-x-0 top-0 h-1/2 rounded-b-md";
    case "bottom": return "inset-x-0 bottom-0 h-1/2 rounded-t-md";
    case "center": return "inset-0 rounded-md";
    default:       return "inset-0";
  }
}

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
  const editorRef = useRef<HTMLDivElement>(null);

  /** Returns true if the cursor is inside the editor area (below the tab bar). */
  const isInEditorArea = (clientY: number): boolean => {
    if (!editorRef.current) return true;
    return clientY >= editorRef.current.getBoundingClientRect().top;
  };

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
        if (!isInEditorArea(e.clientY)) {
          // Cursor is in the tab bar — reorder mode, hide split overlay.
          onSplitTargetDragLeave?.("center", e as unknown as DragEvent<HTMLDivElement>);
          return;
        }
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
        if (!isInEditorArea(e.clientY)) return;
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
      <div ref={editorRef} className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
        {/* Single split-preview overlay. Geometry snaps to the hovered direction;
            opacity fades in/out so there are no jarring strip indicators. */}
        <div
          className={cn(
            "pointer-events-none absolute z-10 transition-opacity duration-150",
            "border border-[var(--sat-accent-primary)]",
            "bg-[color-mix(in_srgb,var(--sat-accent-primary)_18%,transparent)]",
            (!showSplitTargets || !activeSplitTarget) ? "opacity-0" : "opacity-100",
            getSplitPreviewClass(activeSplitTarget),
          )}
        />
      </div>
    </section>
  );
}
