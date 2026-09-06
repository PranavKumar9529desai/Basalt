import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

export interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  /** Start collapsed (content hidden). Default: false. */
  defaultCollapsed?: boolean;
  className?: string;
}

/**
 * Collapsible section for stacked side docks (Obsidian right-sidebar parity).
 *
 * A header strip with the section title and a chevron toggle; content
 * conditionally rendered below. Used by SideDock in stacked mode — a
 * dumb presentational primitive with no business-state imports.
 */
export function SidebarSection({
  title,
  children,
  defaultCollapsed = false,
  className,
}: SidebarSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-7 shrink-0 items-center gap-1 px-2 text-left hover:bg-[var(--sat-surface-3)] transition-colors w-full"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <IconChevronRight
            size={14}
            stroke={1.5}
            className="shrink-0 text-[var(--sat-text-muted)]"
          />
        ) : (
          <IconChevronDown
            size={14}
            stroke={1.5}
            className="shrink-0 text-[var(--sat-text-muted)]"
          />
        )}
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--sat-text-secondary)] select-none">
          {title}
        </span>
      </button>
      {!collapsed && (
        <div className="min-h-0 overflow-y-auto flex-1">{children}</div>
      )}
    </div>
  );
}
