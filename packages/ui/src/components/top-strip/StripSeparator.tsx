import { cn } from "@workspace/ui/lib/utils";

export interface StripSeparatorProps {
  className?: string;
}

/**
 * The single continuous hairline under the workspace header band.
 *
 * Placement contract (owned by the shell's workspace grid):
 * - Grid item in the header row (`row-start-1`), pinned to its bottom edge
 *   (`self-end`) so the active tab — which is bottom-aligned inside the same
 *   band — can paint over it, producing the "cut-through" look.
 * - Spans every header column EXCEPT the ribbon (`col-start-2`), whose
 *   vertical border runs through the band unbroken.
 *
 * Z-order contract:
 * - z-10: paints above section backgrounds (which stay z-auto)...
 * - ...but below cut-through content: the active tab and the chrome nubs
 *   (both z-20) carve the line around themselves.
 *
 * Sections must NOT draw their own header hairlines — this element is the
 * single source of truth for the line.
 */
export function StripSeparator({ className }: StripSeparatorProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none z-10 h-px bg-[var(--sat-layout-border)]",
        className,
      )}
    />
  );
}
