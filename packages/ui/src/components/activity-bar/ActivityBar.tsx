import type { FC } from "react";
import type { ActivityBarItemData } from "./ActivityBarItem";
import { ActivityBarItem } from "./ActivityBarItem";

export interface ActivityBarProps {
  topItems: ActivityBarItemData[];
  bottomItems: ActivityBarItemData[];
  activeId: string | null;
  onItemClick: (id: string) => void;
}

export const ActivityBar: FC<ActivityBarProps> = ({
  topItems,
  bottomItems,
  activeId,
  onItemClick,
}) => {
  return (
    <div className="flex flex-col w-11 shrink-0 h-full border-r border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)]">
      <div className="flex flex-col items-center mt-2 space-y-2">
        {topItems.map((item) => (
          <ActivityBarItem
            key={item.id}
            {...item}
            isActive={activeId === item.id}
            onClick={onItemClick}
          />
        ))}
      </div>
      <div className="flex flex-col items-center mt-auto mb-2 space-y-2">
        {bottomItems.map((item) => (
          <ActivityBarItem
            key={item.id}
            {...item}
            isActive={activeId === item.id}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
};
