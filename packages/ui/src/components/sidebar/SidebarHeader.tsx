import { memo } from "react";
import type { FC, ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

export interface SidebarAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface SidebarHeaderProps {
  actions: SidebarAction[];
}

export const SidebarHeader: FC<SidebarHeaderProps> = memo(({ actions }) => {
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
    </div>
  );
});
