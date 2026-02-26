import type { FC, ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export interface ActivityBarItemData {
  id: string;
  icon: ReactNode;
  label: string;
  badge?: number | boolean;
}

export interface ActivityBarItemProps extends ActivityBarItemData {
  isActive: boolean;
  onClick: (id: string) => void;
}

export const ActivityBarItem: FC<ActivityBarItemProps> = ({
  id,
  icon,
  label,
  isActive,
  onClick,
  badge,
}) => {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => onClick(id)}
            className={cn(
              "relative flex items-center justify-center py-2.5 w-full transition-colors outline-none",
              isActive
                ? "text-[var(--sat-text-primary)]"
                : "text-[var(--sat-text-muted)] hover:text-[var(--sat-text-primary)]",
            )}
          />
        }
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-[var(--sat-accent-primary)] rounded-r-md" />
        )}
        {icon}
        {badge !== undefined && (
          <div className="absolute top-1.5 right-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-[var(--sat-accent-primary)] px-0.5 text-[8px] font-bold text-[var(--sat-text-inverse)]">
            {typeof badge === "number" ? badge : ""}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <span className="text-xs">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
};
