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
  actions: SidebarAction[];
  /** Optional element pinned to the far-right of the header (e.g. collapse). */
  trailing?: ReactNode;
}

export const SidebarHeader: FC<SidebarHeaderProps> = memo(
  ({ actions, trailing }) => {
    return (
      <div className="flex bg-[var(--sat-surface-2)] items-center h-9 shrink-0 border-t border-[var(--sat-layout-border)] px-2 gap-1">
        <div className="flex items-center gap-1 mx-auto">
          {actions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
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
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    );
  },
);
