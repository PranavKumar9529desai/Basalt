import { viewRegistry, type ViewSide } from "@workspace/views";
import { cn } from "@workspace/ui/lib/utils";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { SidebarPanel } from "@workspace/ui/components/sidebar";

export interface SideDockProps {
  side: ViewSide;
  collapsed?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  onWidthChange?: (width: number) => void;
  /** Rendered as a collapse affordance in the dock header (right docks). */
  onCollapse?: () => void;
  /** Grid placement classes for the workspace grid. */
  className?: string;
}

/**
 * SideDock — generic container for registered views (ADR-018).
 *
 * Renders whatever views the registry has for its side: a tab switcher
 * when there are several, the active view's header actions, and the
 * active view's content. Knows nothing about specific views — adding a
 * panel is a registerView() call, never an edit here.
 *
 * The header strip is a plain h-10 band cell; the bottom hairline is
 * owned by the shell's HeaderBandRule.
 */
export function SideDock({
  side,
  collapsed = false,
  defaultWidth,
  minWidth,
  onWidthChange,
  onCollapse,
  className,
}: SideDockProps) {
  const views = viewRegistry.getBySide(side);
  const [activeType, setActiveType] = useState<string | null>(
    views[0]?.type ?? null,
  );
  const active = views.find((v) => v.type === activeType) ?? views[0];

  if (collapsed || !active) return null;

  const ActiveView = active.component;
  const ActiveHeaderActions = active.headerActions;
  const CollapseIcon = side === "left" ? IconChevronLeft : IconChevronRight;

  return (
    <SidebarPanel
      defaultWidth={defaultWidth}
      minWidth={minWidth}
      onWidthChange={onWidthChange}
      side={side}
      className={className}
    >
      {/* pt-1 mirrors the tab bar's bottom-anchored tabs (h-9 in h-10) so
          header content shares their vertical center instead of floating 2px
          high in the full band. */}
      <div className="flex h-10 shrink-0 items-center bg-[var(--sat-surface-2)] px-2 pt-1 gap-1">
        {views.length > 1
          ? views.map((view) => {
            const isActive = view.type === active.type;
            const Icon = view.icon;
            return (
              <button
                key={view.type}
                type="button"
                aria-label={view.name}
                title={view.name}
                aria-pressed={isActive}
                onClick={() => setActiveType(view.type)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded transition-colors outline-none",
                  isActive
                    ? "bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
                    : "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
                )}
              >
                <Icon size={18} stroke={1.5} />
              </button>
            );
          })
          : null}

        {ActiveHeaderActions ? (
          <div className="flex flex-1 items-center justify-center">
            <ActiveHeaderActions />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] transition-colors"
          >
            <CollapseIcon size={16} stroke={1.5} />
          </button>
        ) : null}
      </div>

      <ActiveView />
    </SidebarPanel>
  );
}
