import { cn } from "@workspace/ui/lib/utils";

export interface DropIndicatorProps {
  /** Which edge of the tab the insertion line sits on. */
  edge: "left" | "right";
}

// DropIndicator — the vertical accent line marking where a dragged tab
// would be inserted. Rendered inside the tab pill flush against either
// edge; pointer-events-free so it never intercepts drag events.
export function DropIndicator({ edge }: DropIndicatorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1 bottom-1 z-30 w-0.5 rounded-full bg-[var(--sat-accent-primary)]",
        edge === "left" ? "left-0" : "right-0",
      )}
    />
  );
}
