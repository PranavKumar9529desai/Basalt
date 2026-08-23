import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

export interface TopStripProps {
  /** Permanent workspace toggles pinned to the far left (e.g. FileTreeToggle). */
  leftSlot?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Full-width chrome strip pinned above the workspace (Obsidian-style).
 * Always visible and independent of sidebar state. Owns the single bottom
 * hairline shared by its contents, so the strip reads as one continuous
 * band across toggles, sidebar area, and editor tabs.
 */
export function TopStrip({ leftSlot, children, className }: TopStripProps) {
  return (
    <div
      className={cn(
        "relative z-40 flex h-10 shrink-0 items-stretch bg-[var(--sat-surface-2)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--sat-layout-border)]",
        className,
      )}
    >
      {leftSlot ? (
        <div className="flex shrink-0 items-center gap-1 px-2">{leftSlot}</div>
      ) : null}
      {children}
    </div>
  );
}
