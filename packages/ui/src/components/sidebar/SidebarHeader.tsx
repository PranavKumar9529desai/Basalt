import { memo } from "react";
import type { FC, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export interface SidebarAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface SidebarHeaderProps {
  /** View name shown at the left edge (e.g. "Files"). */
  title?: string;
  actions: SidebarAction[];
  /** Optional element pinned to the far-right of the header (e.g. collapse). */
  trailing?: ReactNode;
}

/**
 * Header strip rendered at the top of a sidebar panel. Sized to match the
 * tab bar (h-10). The bottom hairline is NOT drawn here — the shell's
 * <StripSeparator> owns the single continuous line across all header
 * sections, so they read as one unified band (the Obsidian look).
 */
export const SidebarHeader: FC<SidebarHeaderProps> = memo(
  ({ title, actions, trailing }) => {
    return (
      <div className="relative flex shrink-0 items-center h-10 bg-[var(--sat-surface-2)] px-2 gap-0.5">
        {title ? (
          <span className="mr-auto truncate text-xs font-semibold uppercase tracking-wide text-[var(--sat-text-secondary)] select-none">
            {title}
          </span>
        ) : null}
        <div
          className={
            title
              ? "flex items-center gap-0.5"
              : "flex items-center gap-0.5 mx-auto"
          }
        >
          {actions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={action.label}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className="p-1 rounded text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  />
                }
              >
                {action.icon}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="text-xs">{action.label}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {trailing ? <div className="shrink-0 ml-1">{trailing}</div> : null}
      </div>
    );
  },
);
