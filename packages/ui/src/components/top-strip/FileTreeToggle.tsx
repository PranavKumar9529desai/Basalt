import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { cn } from "@workspace/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export interface FileTreeToggleProps {
  /** Whether the file-tree sidebar is currently visible. */
  open: boolean;
  onToggle: () => void;
}

/**
 * Sidebar-collapse toggle pinned to the far-left of the TopStrip. Always
 * rendered regardless of sidebar state — it is the permanent affordance
 * for expanding/collapsing the file tree (Obsidian behavior).
 */
export function FileTreeToggle({ open, onToggle }: FileTreeToggleProps) {
  const Icon = open
    ? IconLayoutSidebarLeftCollapse
    : IconLayoutSidebarLeftExpand;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={open ? "Collapse file tree" : "Expand file tree"}
            aria-pressed={open}
            onClick={onToggle}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors outline-none",
              open
                ? "text-[var(--sat-text-primary)]"
                : "text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]",
              "hover:bg-[var(--sat-surface-3)]",
            )}
          />
        }
      >
        <Icon size={18} stroke={1.5} />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">
          {open ? "Collapse file tree" : "Expand file tree"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
