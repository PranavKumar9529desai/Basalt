import { viewRegistry, type ViewSide } from "@workspace/views";
import { cn } from "@workspace/ui/lib/utils";
import { useState, useMemo } from "react";
import { SidebarPanel, SidebarSection } from "@workspace/ui/components/sidebar";

export interface SideDockProps {
  side: ViewSide;
  collapsed?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  onWidthChange?: (width: number) => void;
  /** Grid placement classes for the workspace grid. */
  className?: string;
}

/**
 * SideDock — generic container for registered views (ADR-018).
 *
 * Two modes:
 *  - **Single-view** (default): a tab-switcher header showing one active view
 *    at a time. The header shows icon buttons for each view and the active
 *    view's headerActions.
 *  - **Stacked sections** (Obsidian right-sidebar parity): when ALL views for
 *    this side have `section: true`, the dock renders all visible sections
 *    stacked vertically. The header becomes a row of toggle buttons — clicking
 *    an icon shows/hides that section. Each section gets its own collapsible
 *    header strip via SidebarSection.
 *
 * The header strip is a plain h-10 band cell; the bottom hairline is
 * owned by the shell's HeaderBandRule.
 *
 * The sidebar open/close toggle lives in the tab bar's rightSlot (Shell.tsx),
 * not here — this component owns only internal panel controls.
 */
export function SideDock({
  side,
  collapsed = false,
  defaultWidth,
  minWidth,
  onWidthChange,
  className,
}: SideDockProps) {
  const views = viewRegistry.getBySide(side);

  // Stacked mode: all views for this side must be registered as sections.
  const isStacked = views.length > 0 && views.every((v) => v.section === true);

  // Single-view state (used when isStacked is false).
  const [activeType, setActiveType] = useState<string | null>(
    views[0]?.type ?? null,
  );
  const active = views.find((v) => v.type === activeType) ?? views[0];

  // Stacked-mode state: which sections are visible (default: all).
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    () => new Set(views.map((v) => v.type)),
  );

  const visibleViews = useMemo(
    () => views.filter((v) => visibleSections.has(v.type)),
    [views, visibleSections],
  );

  const toggleSection = (type: string) => {
    setVisibleSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Early return only after all hooks have been called.
  if (collapsed || (!isStacked && !active)) return null;

  // --- Stacked sections mode (right dock, all section: true) ---
  if (isStacked) {
    return (
      <SidebarPanel
        defaultWidth={defaultWidth}
        minWidth={minWidth}
        onWidthChange={onWidthChange}
        side={side}
        className={className}
      >
        {/* Section toggle header — one icon per registered section */}
        <div className="flex h-10 shrink-0 items-center bg-[var(--sat-surface-2)] px-2 gap-1">
          {views.map((view) => {
            const isVisible = visibleSections.has(view.type);
            const Icon = view.icon;
            return (
              <button
                key={view.type}
                type="button"
                aria-label={view.name}
                title={isVisible ? `Hide ${view.name}` : `Show ${view.name}`}
                aria-pressed={isVisible}
                onClick={() => toggleSection(view.type)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded transition-colors outline-none",
                  isVisible
                    ? "bg-[var(--sat-surface-3)] text-[var(--sat-text-primary)]"
                    : "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
                )}
              >
                <Icon size={18} stroke={1.5} />
              </button>
            );
          })}

          <div className="flex-1" />
        </div>

        {/* Stacked sections — each visible section gets its own collapsible drawer */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
          {visibleViews.map((view) => (
            <SidebarSection key={view.type} title={view.name}>
              <view.component />
            </SidebarSection>
          ))}
        </div>
      </SidebarPanel>
    );
  }

  // --- Single-view mode (default, e.g. left dock) ---
  const ActiveView = active.component;
  const ActiveHeaderActions = active.headerActions;

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
      </div>

      <ActiveView />
    </SidebarPanel>
  );
}
